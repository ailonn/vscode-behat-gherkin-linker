/**
 * E2E restart suite — runs inside a FRESH VSCode extension host (SPEC §7).
 *
 * `workbench.action.reloadWindow` cannot be exercised from inside the host:
 * the reload kills the host that carries the suite (its run Promise never
 * settles). The faithful implementation of the reload scenario is a second
 * VSCode launch on the same workspace (runner.mjs): a brand-new extension
 * host must re-activate on startup and reproduce the reference index — the
 * diagnostics reappear and the navigation resolves again.
 *
 * ESM test-runner contract: same as suite.mjs (run(testsPath): Promise).
 */
import * as vscode from "vscode";
import assert from "node:assert/strict";

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

function docUri(relPath) {
  const roots = vscode.workspace.workspaceFolders;
  assert.ok(roots && roots.length > 0, "a workspace folder is open");
  return vscode.Uri.joinPath(roots[0].uri, relPath);
}

async function waitForActivation(timeoutMs = 20000) {
  const ext = vscode.extensions.getExtension("ailonn.gherkin-behat-linker");
  assert.ok(ext, "the development extension is installed");
  const start = Date.now();
  while (!ext.isActive) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`extension not activated after ${timeoutMs} ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** Poll an (async) predicate until truthy — the index builds async. */
async function waitFor(label, predicate, timeoutMs = 15000) {
  const start = Date.now();
  for (;;) {
    if (await predicate()) {
      return;
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(`timeout waiting for: ${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

function toLocations(result) {
  const arr = Array.isArray(result) ? result : result ? [result] : [];
  return arr.map((l) => ({
    uri: l.targetUri ?? l.uri,
    range: l.targetRange ?? l.range,
  }));
}

const ERROR = vscode.DiagnosticSeverity.Error;
const INFO = vscode.DiagnosticSeverity.Information;

test("restart: the reference diagnostics reappear (undefined-step error + orphan info)", async () => {
  await waitForActivation();
  const commandes = await vscode.workspace.openTextDocument(docUri("commandes.feature"));
  await waitFor(
    "restart: the undefined-step error is back",
    async () =>
      vscode.languages
        .getDiagnostics(commandes.uri)
        .some((d) => d.severity === ERROR)
  );
  const php = await vscode.workspace.openTextDocument(docUri("CommandeSteps.php"));
  await waitFor(
    "restart: the orphan info is back",
    async () =>
      vscode.languages
        .getDiagnostics(php.uri)
        .some((d) => d.severity === INFO && /orphan/i.test(d.message))
  );
});

test("restart: the navigation providers resolve again", async () => {
  await waitForActivation();
  const commandes = await vscode.workspace.openTextDocument(docUri("commandes.feature"));
  const defs = toLocations(
    await vscode.commands.executeCommand(
      "vscode.executeDefinitionProvider",
      commandes.uri,
      new vscode.Position(5, 10)
    )
  );
  assert.equal(defs.length, 1, "the definition still resolves to exactly one location");
  assert.ok(
    defs[0].uri.fsPath.endsWith("CommandeSteps.php") && defs[0].range.start.line === 14,
    `definition location: ${JSON.stringify(defs)}`
  );
  const php = await vscode.workspace.openTextDocument(docUri("CommandeSteps.php"));
  const refs = toLocations(
    await vscode.commands.executeCommand(
      "vscode.executeReferenceProvider",
      php.uri,
      new vscode.Position(14, 10)
    )
  );
  assert.equal(refs.length, 2, "the reference still resolves to exactly two steps");
});

/**
 * @param {string} testsPath — this module's file path (passed by the host).
 * @param {(error?: Error, failures?: number) => void} [_onComplete] —
 *   optional host callback; unused (Promise channel only).
 */
export function run(testsPath, _onComplete) {
  void _onComplete;
  void testsPath;
  return (async () => {
    let failures = 0;
    for (const { name, fn } of tests) {
      try {
        await fn();
        console.log(`ok - ${name}`);
      } catch (err) {
        failures += 1;
        console.error(`FAIL - ${name}`);
        console.error(err);
      }
    }
    console.log(`E2E restart suite: ${tests.length - failures}/${tests.length} passed`);
    if (failures > 0) {
      throw new Error(`${failures}/${tests.length} e2e restart test(s) failed`);
    }
  })();
}
