/**
 * E2E runner — @vscode/test-electron (SPEC.md §5, `test/integration/`).
 *
 * Launches a VSCode instance with the extension under development
 * (repo root — "main" → out/extension/activation.js, ESM) and opens the
 * generated e2e workspace as the workspace folder:
 *
 *   test/integration/workspace/          (generated, gitignored)
 *     ├── <test/fixtures/*>              reference mini-project, copied verbatim
 *     └── e2e/<integration fixtures>     e2e-only cases (duplicate, broken
 *                                        Gherkin, untranslatable) — never in
 *                                        test/fixtures/ (unit counters stay intact)
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

const failed = await runTests({
  extensionDevelopmentPath: repo,
  extensionTestsPath: join(here, "suite.mjs"),
  launchArgs: [
    ws, // generated e2e workspace
    "--disable-telemetry",
    "--disable-workspace-trust",
    "--skip-welcome",
    "--skip-release-notes",
  ],
});

if (failed > 0) {
  process.exit(1);
}
