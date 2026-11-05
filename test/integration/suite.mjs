/**
 * E2E suite — runs inside the VSCode extension host (SPEC.md §5).
 *
 * ESM test-runner contract (VSCode ≥ 1.90, `extHostExtensionService
 * #_doHandleExtensionTests`): the module must export
 *   run(testsPath): Promise<void>
 * — the host passes this file's own path and settles the run from the
 * Promise (resolves → success, rejects → failure). A second, optional
 * `onComplete(error?, failures?)` callback is passed by the host as well;
 * this suite uses the documented Promise channel only.
 *
 * E1 smoke: the fixture workspace is open, the extension activates
 * (ESM main loads) and the command bus works. Slices S1–S5 add the
 * acceptance scenarios AC-1..AC-5 (diagnostics, navigation, hover,
 * rebuild).
 */
import * as vscode from "vscode";
import assert from "node:assert/strict";

/**
 * Minimal named-test registry — one entry per acceptance scenario.
 * Kept dependency-free on purpose: the extension host runs this module
 * as-is (no mocha wiring), and the exit code is carried by `run`'s
 * Promise (see the contract above).
 */
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

/**
 * The test host starts running before `onStartupFinished` fires, so the
 * extension (activated on startup) may not be active yet — poll until it
 * is. Product activation policy stays `onStartupFinished` (the index glob
 * is user-configurable, so a lazy `workspaceContains` event could miss it).
 */
async function waitForActivation(timeoutMs = 15000) {
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

// --- E1 smoke (harness proof, not an AC) ---------------------------------

test("E1: fixture workspace is open", () => {
  const roots = vscode.workspace.workspaceFolders;
  assert.ok(roots, "a workspace folder is open");
  assert.match(
    roots[0].uri.fsPath,
    /fixtures/,
    "the fixture folder is the workspace root"
  );
});

test("E1: extension activates and the command bus works (ESM main)", async () => {
  await waitForActivation();
  const pong = await vscode.commands.executeCommand("gherkinBehat.ping");
  assert.equal(pong, "pong", "gherkinBehat.ping resolves to 'pong'");
});

// --- entry point (called by the extension host) ---------------------------

/**
 * @param {string} testsPath — this module's file path (passed by the host).
 * @param {(error?: Error, failures?: number) => void} [_onComplete] —
 *   optional host callback; unused (Promise channel only).
 */
export function run(testsPath, _onComplete) {
  void _onComplete;
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
    console.log(
      `E2E suite: ${tests.length - failures}/${tests.length} passed (tests: ${testsPath})`
    );
    if (failures > 0) {
      throw new Error(`${failures}/${tests.length} e2e test(s) failed`);
    }
  })();
}
