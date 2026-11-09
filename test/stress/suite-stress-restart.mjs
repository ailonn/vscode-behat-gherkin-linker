/**
 * Stress E2E restart suite — runs inside a FRESH VS Code extension host
 * (stress-spec.md §2 CA-6, §3 `vehicle` — the 2-launch pattern).
 *
 * The faithful restart (SPEC §7): `workbench.action.reloadWindow` cannot be
 * invoked from inside the host (the reload kills the host carrying the suite)
 * — a fresh VS Code instance on the same stress workspace is the faithful
 * restart: the new extension host must re-activate, rebuild the index on the
 * full-scale workspace, and the probe must resolve again.
 *
 * Test names are `CA-n: <scenario title>` (title verbatim from stress-spec.md
 * §2 — mapping rule B.2, enforced by stress-mapping-guard.test.ts).
 */
import * as vscode from "vscode";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

function workspaceRoot() {
  const roots = vscode.workspace.workspaceFolders;
  assert.ok(roots && roots.length > 0, "a workspace folder is open");
  return roots[0].uri;
}

function docUri(relPath) {
  return vscode.Uri.joinPath(workspaceRoot(), relPath);
}

async function waitForActivation(timeoutMs = 60000) {
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

/** Poll an (async) predicate until truthy — the index rebuilds async (minutes at full scale). */
async function waitFor(label, predicate, timeoutMs) {
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

function probeLine0based(root) {
  const lines = readFileSync(join(root, "stress.feature"), "utf8").split(/\r?\n/);
  const idx = lines.findIndex((l) => l.includes("step 1 of scenario 1 variant"));
  assert.ok(idx >= 0, "the probe step line exists in the generated feature");
  return idx;
}

// The rebuild after a fresh launch costs about as much as the first one —
// a 10 min cap while the budget is still unlocked (the measurement run sets
// it from the first build, F3 — the locked value is reconciled afterwards).
const PROBE_WAIT_MS = 600000;

test("CA-6: After a fresh launch the index rebuilds and the probe still resolves", async () => {
  await waitForActivation();
  const root = workspaceRoot().fsPath;
  const featureUri = docUri("stress.feature");
  const probe = new vscode.Position(probeLine0based(root), 10);
  await waitFor("CA-6: the probe resolves after the fresh launch (the index rebuilt)", async () => {
    const res = await vscode.commands.executeCommand(
      "vscode.executeDefinitionProvider",
      featureUri,
      probe
    );
    return toLocations(res).length === 1;
  }, PROBE_WAIT_MS);
  const defs = toLocations(
    await vscode.commands.executeCommand(
      "vscode.executeDefinitionProvider",
      featureUri,
      probe
    )
  );
  assert.equal(defs.length, 1, "the probe still resolves to exactly 1 definition location");
  assert.ok(
    defs[0].uri.fsPath.endsWith("StressContext.php"),
    `the probe still resolves to StressContext.php: ${JSON.stringify(defs)}`
  );
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
    console.log(`E2E stress restart suite: ${tests.length - failures}/${tests.length} passed`);
    if (failures > 0) {
      throw new Error(`${failures}/${tests.length} e2e stress restart test(s) failed`);
    }
  })();
}
