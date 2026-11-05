/**
 * Extension entry point — the imperative shell (SPEC.md §5).
 *
 * E1 stub: proves the extension activates (ESM main loads) and the command
 * bus works. Slices S1–S5 replace it with the real shell (settings, index
 * service, diagnostics, definition/references/hover providers).
 */
import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("gherkinBehat.ping", () => "pong")
  );
}

export function deactivate(): void {
  // Nothing to release in the stub.
}
