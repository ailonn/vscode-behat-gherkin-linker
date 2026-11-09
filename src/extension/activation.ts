/**
 * Extension entry point — the imperative shell (SPEC.md §5).
 *
 * The only code that imports `vscode`: it reads the workspace with the
 * configured globs, builds the pure core index, and keeps it fresh through
 * debounced, coalesced rebuilds on file changes (SPEC §5 v0 decisions:
 * full rebuild, debounce + last-wins token, `vendor/` + `node_modules/`
 * always excluded). Diagnostics publication and the navigation providers
 * build on this service.
 */
import * as vscode from "vscode";
import { buildIndex } from "../core/index.js";
import { parseFeature } from "../core/gherkin.js";
import { scanPhp } from "../core/php.js";
import type { DefinitionRef, Index, StepRef } from "../core/types.js";
import { ALWAYS_EXCLUDED, readSettings } from "../settings.js";
import {
  type ParseFailure,
  clearDiagnostics,
  publishDiagnostics,
} from "./diagnostics.js";
import { registerDefinitionProvider } from "./definition.js";
import { registerReferenceProvider } from "./references.js";
import { registerHoverProvider } from "./hover.js";
import { isExcludedPath, relativeToRoot } from "./workspace.js";

/** Debounce window for rebuilds (watcher events coalesce into one build). */
const DEBOUNCE_MS = 300;

/**
 * The index service: workspace reading + pure core build.
 *
 * Coalesced rebuilds: scheduled rebuilds debounce into a single build, and
 * a last-wins token guarantees a stale build never overwrites a fresher one
 * (in-flight runs may overlap; only the newest result is published).
 */
export class IndexService {
  private index: Index | null = null;
  private failures: readonly ParseFailure[] = [];
  private buildToken = 0;
  private timer: NodeJS.Timeout | undefined;

  get current(): Index | null {
    return this.index;
  }

  /** Schedules a full rebuild (debounced — repeated events coalesce). */
  schedule(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.rebuild();
    }, DEBOUNCE_MS);
  }

  /** Releases a pending debounce timer (idempotent — called from deactivate). */
  dispose(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * Full rebuild (no incremental indexing — SPEC §5 v0): glob the workspace
   * with the configured patterns (always excluding vendor/ and
   * node_modules/), parse the features, scan the PHP, build the pure index.
   */
  async rebuild(): Promise<void> {
    const token = ++this.buildToken;
    const settings = readSettings();
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!settings.enabled || !root) {
      // Extension disabled (or no workspace): no index, no diagnostics.
      this.index = null;
      this.failures = [];
      clearDiagnostics();
      return;
    }

    const steps: StepRef[] = [];
    const definitions: DefinitionRef[] = [];
    const failures: ParseFailure[] = [];
    const lineLengths = new Map<string, readonly number[]>();
    const seen = new Set<string>();

    const collect = async (
      globs: readonly string[],
      isFeature: boolean
    ): Promise<void> => {
      for (const glob of globs) {
        const files = await vscode.workspace.findFiles(glob, ALWAYS_EXCLUDED);
        for (const file of files) {
          if (seen.has(file.fsPath)) {
            continue;
          }
          seen.add(file.fsPath);
          const relPath = relativeToRoot(root.fsPath, file.fsPath);
          if (relPath === undefined) {
            continue;
          }
          const buffer = await vscode.workspace.fs.readFile(file);
          const source = new TextDecoder("utf-8").decode(buffer);
          // Full-line diagnostic ranges: the source is already read.
          lineLengths.set(
            relPath,
            source.split(/\r?\n/).map((l) => l.length)
          );
          if (isFeature) {
            const parsed = await parseFeature(source, relPath);
            if (parsed.ok) {
              // A single feature can carry 1M+ steps (the stress scale):
              // `push(...steps)` would blow the call stack (V8 argument
              // limit ≈ 65k) — collect one by one.
              for (const step of parsed.steps) {
                steps.push(step);
              }
            } else {
              // ok:false (unparseable Gherkin) becomes a diagnostic —
              // never a crash.
              failures.push({ path: relPath, error: parsed.error });
            }
          } else {
            for (const definition of scanPhp(source, relPath)) {
              definitions.push(definition);
            }
          }
        }
      }
    };

    await collect(settings.features, true);
    await collect(settings.steps, false);

    // Last-wins: a newer rebuild superseded this one — drop the result.
    if (token !== this.buildToken) {
      return;
    }

    this.index = buildIndex(steps, definitions);
    this.failures = failures;
    publishDiagnostics(
      this.index,
      settings.orphans,
      this.failures,
      root,
      lineLengths
    );
  }
}

/** One FileSystemWatcher per configured glob — recreated on settings change. */
let watchers: vscode.Disposable[] = [];

function setupWatchers(
  context: vscode.ExtensionContext,
  service: IndexService
): void {
  for (const watcher of watchers) {
    watcher.dispose();
  }
  watchers = [];
  const settings = readSettings();
  if (!settings.enabled) {
    return;
  }
  for (const pattern of [...settings.features, ...settings.steps]) {
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    // The watcher API has no exclude parameter — filter the always-excluded
    // segments (SPEC §5) on the events (a `composer install` must not
    // trigger rebuilds).
    watcher.onDidCreate((file) => {
      if (!isExcludedPath(file.fsPath)) {
        service.schedule();
      }
    });
    watcher.onDidChange((file) => {
      if (!isExcludedPath(file.fsPath)) {
        service.schedule();
      }
    });
    watcher.onDidDelete((file) => {
      if (!isExcludedPath(file.fsPath)) {
        service.schedule();
      }
    });
    context.subscriptions.push(watcher);
    watchers.push(watcher);
  }
}

let service: IndexService | null = null;

export function activate(context: vscode.ExtensionContext): void {
  const svc = new IndexService();
  service = svc;

  registerDefinitionProvider(context, svc);
  registerReferenceProvider(context, svc);
  registerHoverProvider(context, svc);

  setupWatchers(context, svc);
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("gherkinBehat")) {
        setupWatchers(context, svc);
        svc.schedule();
      }
    })
  );

  // Initial index at activation (onStartupFinished).
  void svc.rebuild();
}

export function deactivate(): void {
  // The debounce timer is a service field, not a subscription — release it
  // explicitly so a pending rebuild can never run on a dead context.
  if (service !== null) {
    service.dispose();
    service = null;
  }
  // Watchers and listeners are released with the extension context.
}
