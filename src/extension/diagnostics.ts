/**
 * Diagnostics publication (SPEC.md §5 — `src/extension/diagnostics.ts`).
 *
 * The six diagnostics (plan-lot2 table, the sixth added by the 2026-11-09
 * chat-noir cycle — CRASH-003):
 * 1. undefined step → ERROR at the feature step line
 * 2. orphan definition → INFO at the PHP annotation line
 *    (gated by `gherkinBehat.orphans`, default true)
 * 3. duplicate definition → WARNING at every line of the group
 * 4. untranslatable expression → INFO at the annotation line, the reason
 *    in the message (fail loud)
 * 5. unparseable Gherkin → ERROR at the parser-reported line (line 0 if
 *    the parser gives none)
 * 6. unreadable file → ERROR at the top of the file (line 0): the read
 *    itself failed (EACCES, NFS failure, …) — the file is skipped and the
 *    rest of the index is published (partial index — the read failure must
 *    never reject the whole rebuild, CRASH-003)
 *
 * Ranges span the whole flagged line (the squiggle is the day-1 signal) —
 * line lengths come from the sources read at rebuild time.
 */
import * as vscode from "vscode";
import type { Index } from "../core/types.js";
import {
  duplicateDefinitions,
  orphanedDefinitions,
  undefinedSteps,
} from "../core/index.js";

export const SOURCE = "gherkin-behat-linker";

export interface ParseFailure {
  readonly path: string;
  readonly error: string;
}

/** A source file the extension host could not read (CRASH-003). */
export interface ReadFailure {
  readonly path: string;
  readonly reason: string;
}

const collection = vscode.languages.createDiagnosticCollection(SOURCE);

export function clearDiagnostics(): void {
  collection.clear();
}

/**
 * The Gherkin parser reports the offending position in the error message
 * as "(<line>:<column>)" — 1-based line extracted, 0-based stored.
 */
function parseErrorLine(error: string): number {
  const m = /\((\d+):/.exec(error);
  return m ? Math.max(0, Number(m[1]) - 1) : 0;
}

export function publishDiagnostics(
  index: Index,
  orphansEnabled: boolean,
  parseFailures: readonly ParseFailure[],
  readFailures: readonly ReadFailure[],
  root: vscode.Uri,
  /** Line lengths per source file (0-based) — full-line diagnostic ranges. */
  lineLengths: ReadonlyMap<string, readonly number[]>
): void {
  const byUri = new Map<string, vscode.Diagnostic[]>();
  const add = (
    relPath: string,
    line0: number,
    severity: vscode.DiagnosticSeverity,
    message: string
  ): void => {
    const uri = vscode.Uri.joinPath(root, relPath).toString();
    const list = byUri.get(uri) ?? [];
    // The squiggle spans the whole flagged line; the source is always read
    // at rebuild time (fallback: one character).
    const length = lineLengths.get(relPath)?.[line0] ?? 1;
    list.push(
      new vscode.Diagnostic(
        new vscode.Range(line0, 0, line0, length),
        message,
        severity
      )
    );
    byUri.set(uri, list);
  };

  for (const step of undefinedSteps(index)) {
    add(
      step.path,
      step.line - 1,
      vscode.DiagnosticSeverity.Error,
      `Undefined step: "${step.text}" is not matched by any step definition`
    );
  }

  if (orphansEnabled) {
    for (const def of orphanedDefinitions(index)) {
      add(
        def.path,
        def.line - 1,
        vscode.DiagnosticSeverity.Information,
        `Orphan definition: no step matches "${def.expression}"`
      );
    }
  }

  for (const group of duplicateDefinitions(index)) {
    for (const def of group.definitions) {
      add(
        def.path,
        def.line - 1,
        vscode.DiagnosticSeverity.Warning,
        `Duplicate definition: ${group.definitions.length} definitions share the pattern "${group.expression}" — a matching step is ambiguous (Behat AmbiguousMatchException)`
      );
    }
  }

  for (const { definition, reason } of index.untranslatable) {
    add(
      definition.path,
      definition.line - 1,
      vscode.DiagnosticSeverity.Information,
      `Untranslatable expression (never matched): ${reason}`
    );
  }

  for (const failure of parseFailures) {
    add(
      failure.path,
      parseErrorLine(failure.error),
      vscode.DiagnosticSeverity.Error,
      `Unparseable Gherkin: ${failure.error}`
    );
  }

  for (const failure of readFailures) {
    // Line 0: the source could not be read, there is no line to span.
    add(
      failure.path,
      0,
      vscode.DiagnosticSeverity.Error,
      `Cannot read file: ${failure.reason}`
    );
  }

  collection.clear();
  for (const [uri, diagnostics] of byUri) {
    collection.set(vscode.Uri.parse(uri), diagnostics);
  }
}
