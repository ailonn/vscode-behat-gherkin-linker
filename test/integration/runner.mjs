/**
 * E2E runner — @vscode/test-electron (SPEC.md §5, `test/integration/`).
 *
 * Launches a VSCode instance with the extension under development
 * (repo root — "main" → out/extension/activation.js, ESM) and opens the
 * reference fixture (`test/fixtures/`) as the workspace.
 *
 * Run: `npm run test:integration` (builds with tsc first).
 * The downloaded VSCode lives in `.vscode-test/` (gitignored).
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runTests } from "@vscode/test-electron";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");

const failed = await runTests({
  extensionDevelopmentPath: repo,
  extensionTestsPath: join(here, "suite.mjs"),
  launchArgs: [
    join(repo, "test", "fixtures"), // reference mini-project as the workspace
    "--disable-telemetry",
    "--disable-workspace-trust",
    "--skip-welcome",
    "--skip-release-notes",
  ],
});

if (failed > 0) {
  process.exit(1);
}
