/**
 * ReferenceProvider — PHP → features (AC-2, reverse navigation).
 *
 * A cursor on a step-definition annotation line resolves to ALL matching
 * feature steps (the reverse of the DefinitionProvider). A method carrying
 * N annotations yields N definitions — only the annotation under the
 * cursor resolves here.
 */
import * as vscode from "vscode";
import { posix } from "node:path";
import { definitionKey } from "../core/types.js";
import type { Index } from "../core/types.js";

const PHP_SELECTOR: vscode.DocumentSelector = [
  { scheme: "file", language: "php" },
  { scheme: "file", pattern: "**/*.php" },
];

interface IndexSource {
  readonly current: Index | null;
}

export function registerReferenceProvider(
  context: vscode.ExtensionContext,
  source: IndexSource
): void {
  const provider: vscode.ReferenceProvider = {
    provideReferences(document, position) {
      const index = source.current;
      const root = vscode.workspace.workspaceFolders?.[0]?.uri;
      if (!index || !root) {
        return [];
      }
      const relPath = relativePath(root, document.uri);
      if (relPath === undefined) {
        return [];
      }
      const def = index.definitions.find(
        (d) => d.path === relPath && d.line === position.line + 1
      );
      if (!def) {
        return [];
      }
      const steps = index.definitionToSteps.get(definitionKey(def)) ?? [];
      return steps.map(
        (s) =>
          new vscode.Location(
            vscode.Uri.joinPath(root, s.path),
            new vscode.Range(s.line - 1, 0, s.line - 1, 1)
          )
      );
    },
  };
  context.subscriptions.push(
    vscode.languages.registerReferenceProvider(PHP_SELECTOR, provider)
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
