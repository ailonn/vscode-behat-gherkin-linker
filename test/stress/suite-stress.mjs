/**
 * Stress E2E suite — runs inside a real VS Code extension host (stress-spec.md
 * §2 CA-4/CA-5, §3 `vehicle`).
 *
 * Workspace: `test/stress/generated/` (built by stress-runner.mjs — a
 * deterministic full-scale or smoke-scale fixture, seed 42).
 *
 * The probe is the real product feature (no test hook in the shipped code, no
 * contributed command — E1 locks the absence): `vscode.executeDefinitionProvider`
 * on the probe step "step 1 of scenario 1" (line found in the generated file,
 * not hardcoded — the layout is a generator implementation detail).
 *
 * Test names are `CA-n: <scenario title>` (title verbatim from stress-spec.md
 * §2 — mapping rule B.2, enforced by stress-mapping-guard.test.ts).
 *
 * Measurement contract (CA-5): RUN_START_MS is captured at module load (the
 * stress run start, inside the extension host); CA-4 (first in the registry)
 * captures FIRST_PROBE_MS at the moment the probe resolves for the first
 * time; CA-5 (second) asserts the elapsed stays within the locked budget.
 */
import * as vscode from "vscode";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The wall-time budget (CA-5) — locked in stress-spec.md §3 `budget` (F3):
// budget = ceil(baseline × 3, 5 s). Baseline 17905 ms measured 2026-11-09
// (full-scale first GREEN run) → budget 55 s. A breach is a performance
// regression (BLOQUANT), never a spec tweak.
const BUDGET_MS = 55000;

// The stress run start (inside the extension host) — module load.
const RUN_START_MS = Date.now();

// Set by CA-4 (first registry entry) at the moment of first probe resolution.
let FIRST_PROBE_MS = 0;

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

/** Poll an (async) predicate until truthy — the index builds async (minutes at full scale). */
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

/** The 0-based line of the probe step in the generated feature (found, not hardcoded). */
function probeLine0based(root) {
  const lines = readFileSync(join(root, "stress.feature"), "utf8").split(/\r?\n/);
  const idx = lines.findIndex((l) => l.includes("step 1 of scenario 1 variant"));
  assert.ok(idx >= 0, "the probe step line exists in the generated feature");
  return idx;
}

/** The 0-based line of the `variant 1$` definition in the generated PHP. */
function variantOneLine0based(root) {
  const lines = readFileSync(join(root, "StressContext.php"), "utf8").split(/\r?\n/);
  const idx = lines.findIndex((l) => /@Given \/step .* variant 1\$\/$/.test(l));
  assert.ok(idx >= 0, "the variant 1 definition exists in the generated PHP");
  return idx;
}

/**
 * The probe wait must exceed the worst case: locked budget + slack once
 * locked; a generous 15 min cap while unlocked (the measurement run — the
 * first full-scale index can take minutes).
 */
const PROBE_WAIT_MS = BUDGET_MS > 0 ? BUDGET_MS + 120000 : 900000;

test("CA-4: The full-scale workspace is indexed without crash and the probe resolves to exactly one definition", async () => {
  await waitForActivation();
  const root = workspaceRoot().fsPath;
  const featureUri = docUri("stress.feature");
  const probe = new vscode.Position(probeLine0based(root), 10);
  let first = false;
  await waitFor("CA-4: the probe resolves (the index is built)", async () => {
    const res = await vscode.commands.executeCommand(
      "vscode.executeDefinitionProvider",
      featureUri,
      probe
    );
    return toLocations(res).length === 1;
  }, PROBE_WAIT_MS);
  if (!first) FIRST_PROBE_MS = Date.now();
  const defs = toLocations(
    await vscode.commands.executeCommand(
      "vscode.executeDefinitionProvider",
      featureUri,
      probe
    )
  );
  assert.equal(defs.length, 1, "the probe resolves to exactly 1 definition location");
  assert.ok(
    defs[0].uri.fsPath.endsWith("StressContext.php"),
    `the probe resolves to StressContext.php: ${JSON.stringify(defs)}`
  );
  assert.equal(
    defs[0].range.start.line,
    variantOneLine0based(root),
    "the probe resolves to the variant 1 definition (the exact method)"
  );
  // Full match at scale: no undefined step, no orphan (every definition has
  // usages), no duplicate — the stress feature carries zero diagnostics.
  assert.equal(
    vscode.languages.getDiagnostics(featureUri).length,
    0,
    "zero diagnostics on the stress feature"
  );
});

test("CA-5: The first probe resolution stays within the locked wall-time budget", async () => {
  assert.ok(FIRST_PROBE_MS > 0, "the probe resolved once (CA-4 ran first)");
  const elapsedMs = FIRST_PROBE_MS - RUN_START_MS;
  // The measured value is always reported — it is the baseline input of the
  // F3 lock (budget = ceil(baseline × 3, 5 s)) and the CI regression signal.
  console.log(`stress: first probe resolution at ${elapsedMs} ms (run start → probe, inside the extension host)`);
  assert.ok(
    BUDGET_MS > 0,
    "the budget is locked in stress-spec.md §3 `budget` (F3: measured baseline × 3, rounded up to 5 s)"
  );
  assert.ok(
    elapsedMs <= BUDGET_MS,
    `first probe resolution ${elapsedMs} ms exceeds the locked budget ${BUDGET_MS} ms (performance regression — BLOQUANT)`
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
    console.log(`E2E stress suite: ${tests.length - failures}/${tests.length} passed`);
    if (failures > 0) {
      throw new Error(`${failures}/${tests.length} e2e stress test(s) failed`);
    }
  })();
}
