/**
 * DefinitionProvider — feature → PHP (AC-1).
 *
 * A cursor on a step line resolves to the matching definition(s). Matching
 * is type-agnostic (Behat semantics); several matches = ambiguous, and all
 * of them are returned — the runtime would throw the
 * AmbiguousMatchException on that step.
 */
import * as vscode from "vscode";
import { posix } from "node:path";
import { stepKey } from "../core/types.js";
import type { Index } from "../core/types.js";

const FEATURE_SELECTOR: vscode.DocumentSelector = [
  { scheme: "file", language: "gherkin" },
  { scheme: "file", pattern: "**/*.feature" },
];

interface IndexSource {
  readonly current: Index | null;
}

export function registerDefinitionProvider(
  context: vscode.ExtensionContext,
  source: IndexSource
): void {
  const provider: vscode.DefinitionProvider = {
    provideDefinition(document, position) {
      const index = source.current;
      const root = vscode.workspace.workspaceFolders?.[0]?.uri;
      if (!index || !root) {
        return [];
      }
      const relPath = relativePath(root, document.uri);
      if (relPath === undefined) {
        return [];
      }
      const step = index.steps.find(
        (s) => s.path === relPath && s.line === position.line + 1
      );
      if (!step) {
        return [];
      }
      const defs = index.stepToDefinitions.get(stepKey(step)) ?? [];
      return defs.map(
        (d) =>
          new vscode.Location(
            vscode.Uri.joinPath(root, d.path),
            new vscode.Range(d.line - 1, 0, d.line - 1, 1)
          )
      );
    },
  };
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(FEATURE_SELECTOR, provider)
  );
}

/** Workspace-root-relative path (forward slashes) or undefined outside. */
function relativePath(root: vscode.Uri, uri: vscode.Uri): string | undefined {
  const rel = posix.relative(root.fsPath, uri.fsPath);
  if (rel.startsWith("..") || posix.isAbsolute(rel)) {
    return undefined;
  }
  return rel;
}
