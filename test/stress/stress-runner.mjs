/**
 * Stress E2E runner (stress-spec.md §3 `invocation`/`placement`).
 *
 * Generates the stress workspace deterministically (seed 42) and runs two
 * sequential VS Code instances on it (the 2-launch pattern — SPEC §7):
 *   1. suite-stress.mjs          — CA-4 (no crash + functional) + CA-5 (wall-time budget)
 *   2. suite-stress-restart.mjs  — CA-6 (fresh launch re-activates, probe resolves)
 *
 * Scale: STRESS_SCENARIOS / STRESS_STEPS env (default 1000/1000 — the CI smoke
 * sets 100/100, see stress-spec.md §3 `smoke`). Output: `test/stress/generated/`
 * (gitignored, never committed — rebuilt on every run).
 *
 * @vscode/test-electron v3 contract: a failed suite makes the VSCode child
 * exit non-zero → runTests throws TestRunFailedError.
 *
 * Run: `pnpm test:stress`.
 */
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runTests } from "@vscode/test-electron";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");

const scenarios = Number(process.env.STRESS_SCENARIOS ?? 1000);
const steps = Number(process.env.STRESS_STEPS ?? 1000);
const generated = join(here, "generated");

console.log(`stress-runner: generating ${scenarios} x ${steps} (seed 42) → ${generated}`);
rmSync(generated, { recursive: true, force: true });
execFileSync(
  process.execPath,
  [
    join(here, "generate-stress.mjs"),
    "--scenarios",
    String(scenarios),
    "--steps",
    String(steps),
    "--seed",
    "42",
    "--out",
    generated,
  ],
  { stdio: "inherit" }
);

const launchArgs = [
  generated, // the stress workspace (a single .feature + the PHP context)
  "--disable-telemetry",
  "--disable-workspace-trust",
  "--skip-welcome",
  "--skip-release-notes",
];

let failedSuites = 0;
for (const suite of ["suite-stress.mjs", "suite-stress-restart.mjs"]) {
  try {
    await runTests({
      extensionDevelopmentPath: repo,
      extensionTestsPath: join(here, suite),
      launchArgs,
    });
    console.log(`stress-runner: ${suite} OK`);
  } catch (err) {
    failedSuites += 1;
    console.error(`stress-runner: ${suite} FAILED`, err);
  }
}

if (failedSuites > 0) {
  process.exit(1);
}
