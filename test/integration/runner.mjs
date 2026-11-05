/**
 * E2E runner — @vscode/test-electron (SPEC.md §5, `test/integration/`).
 *
 * Launches VSCode instances with the extension under development
 * (repo root — "main" → out/extension/activation.js, ESM) on the generated
 * e2e workspace:
 *
 *   test/integration/workspace/          (generated, gitignored)
 *     ├── <test/fixtures/*>              reference mini-project, copied verbatim
 *     └── e2e/<integration fixtures>     e2e-only cases (duplicate, broken
 *                                        Gherkin, untranslatable, ambiguous)
 *                                        — never in test/fixtures/ (unit
 *                                        counters stay intact)
 *
 * Two sequential launches (the workspace is generated once and reused):
 *   1. suite.mjs          — the AC scenarios (SPEC §3) + setting gates
 *   2. suite-restart.mjs  — SPEC §7: `workbench.action.reloadWindow` cannot
 *      be invoked from inside the host (the reload kills the host carrying
 *      the suite) — a fresh VSCode instance on the same workspace is the
 *      faithful restart: the new extension host must re-activate and
 *      reproduce the reference index.
 *
 * @vscode/test-electron v3 contract: a failed suite makes the VSCode child
 * exit non-zero → runTests throws TestRunFailedError (resolves 0 on success).
 *
 * Run: `npm run test:integration` (builds with tsc first).
 * The downloaded VSCode lives in `.vscode-test/` (gitignored).
 */
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runTests } from "@vscode/test-electron";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");

// Build the e2e workspace fresh on every run (deterministic, no drift).
const ws = join(here, "workspace");
rmSync(ws, { recursive: true, force: true });
mkdirSync(ws, { recursive: true });
cpSync(join(repo, "test", "fixtures"), ws, { recursive: true });
cpSync(join(here, "fixtures", "e2e"), join(ws, "e2e"), { recursive: true });

const launchArgs = [
  ws, // generated e2e workspace
  "--disable-telemetry",
  "--disable-workspace-trust",
  "--skip-welcome",
  "--skip-release-notes",
];

let failedSuites = 0;
for (const suite of ["suite.mjs", "suite-restart.mjs"]) {
  try {
    await runTests({
      extensionDevelopmentPath: repo,
      extensionTestsPath: join(here, suite),
      launchArgs,
    });
    console.log(`runner: ${suite} OK`);
  } catch (err) {
    failedSuites += 1;
    console.error(`runner: ${suite} FAILED`, err);
  }
}

if (failedSuites > 0) {
  process.exit(1);
}
