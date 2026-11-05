/**
 * Extension entry point — the imperative shell (SPEC.md §5).
 *
 * The only code that imports `vscode`: it reads the workspace with the
 * configured globs, builds the pure core index, and keeps it fresh through
 * debounced, single-flight rebuilds on file changes (SPEC §5 v0 decisions:
 * full rebuild, debounce + single-flight, `vendor/` + `node_modules/`
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
 * Single-flight: scheduled rebuilds coalesce (debounce), and an in-flight
 * rebuild is superseded by a newer one (token) — a stale build never
 * overwrites a fresh one.
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

  /**
   * Full rebuild (no incremental indexing — SPEC §5 v0): glob the workspace
   * with the configured patterns (always excluding vendor/ and
   * node_modules/), parse the features, scan the PHP, build the pure index.
   */
  async rebuild(): Promise<void> {
    const token = ++this.buildToken;
    const settings = readSettings();
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) {
      this.index = null;
      this.failures = [];
      clearDiagnostics();
      return;
    }

    const steps: StepRef[] = [];
    const definitions: DefinitionRef[] = [];
    const failures: ParseFailure[] = [];
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
          if (isFeature) {
            const parsed = await parseFeature(source, relPath);
            if (parsed.ok) {
              steps.push(...parsed.steps);
            } else {
              // ok:false (unparseable Gherkin) becomes a diagnostic —
              // never a crash.
              failures.push({ path: relPath, error: parsed.error });
            }
          } else {
            definitions.push(...scanPhp(source, relPath));
          }
        }
      }
    };

    await collect(settings.features, true);
    await collect(settings.steps, false);

    // Single-flight: a newer rebuild superseded this one — drop the result.
    if (token !== this.buildToken) {
      return;
    }

    this.index = buildIndex(steps, definitions);
    this.failures = failures;
    publishDiagnostics(this.index, settings.orphans, this.failures, root);
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

export function activate(context: vscode.ExtensionContext): void {
  const service = new IndexService();

  // E1 smoke command (harness proof — kept for the integration suite).
  context.subscriptions.push(
    vscode.commands.registerCommand("gherkinBehat.ping", () => "pong")
  );

  registerDefinitionProvider(context, service);
  registerReferenceProvider(context, service);
  registerHoverProvider(context, service);

  setupWatchers(context, service);
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("gherkinBehat")) {
        setupWatchers(context, service);
        service.schedule();
      }
    })
  );

  // Initial index at activation (onStartupFinished).
  void service.rebuild();
}

export function deactivate(): void {
  // Watchers, listeners and the debounce timer are released with the
  // extension context subscriptions; nothing else to close.
}
