#!/usr/bin/env node
/**
 * Stress fixture generator (stress-spec.md §2/§3 — `shape`, `scale`, `invocation`).
 *
 * Deterministic (seeded), Node stdlib only, zero personal data, EN:
 * writes `<out>/stress.feature` (N scenarios × M steps) + `<out>/StressContext.php`
 * (100 step definitions). The keyword rotation shifts with the seed —
 * keyword = KEYWORDS[(j + seed mod 3) mod 3] — so the output is a pure
 * function of (scenarios, steps, seed): no clock, no network, no unseeded
 * randomness.
 *
 * Matching invariants (spec CA-3): step text `step <j> of scenario <s> variant
 * <v>` with `v = (s × M + j) mod 100`; method k carries
 * `/step (?P<j>\d+) of scenario \d+ variant (k)$/` — the trailing `$` before
 * the closing delimiter (unanchored Behat semantics, end-of-subject only)
 * makes every step match exactly one definition at every scale.
 *
 * Usage:
 *   node test/stress/generate-stress.mjs [--scenarios N] [--steps M] [--seed S] [--out DIR]
 * Defaults: 1000 / 1000 / 42 / <this dir>/generated.
 *
 * Feedback (POSIX): success = the files written + exit 0 (silent); a failed
 * intent (invalid argument, unwritable output) = an explicit stderr message
 * with the reason + exit 1.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const KEYWORDS = ["Given", "When", "Then"];

const DEFAULTS = {
  scenarios: 1000,
  steps: 1000,
  seed: 42,
  out: join(import.meta.dirname, "generated"),
};

const HELP = `Usage: node generate-stress.mjs [options]

Options:
  --scenarios N   number of scenarios (default 1000)
  --steps M       steps per scenario (default 1000)
  --seed S        keyword-rotation seed (default 42)
  --out DIR       output directory (default <this dir>/generated)
  -h, --help      show this help

Writes: DIR/stress.feature + DIR/StressContext.php (deterministic, EN, zero
personal data — see stress-spec.md).
`;

/** A failed intent is announced with the reason (explicit, exit 1). */
function fail(message) {
  process.stderr.write(`generate-stress: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  const take = (i, flag) => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) {
      fail(`${flag} requires a value`);
    }
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "-h":
      case "--help":
        process.stdout.write(HELP);
        process.exit(0);
        break;
      case "--scenarios":
        args.scenarios = Number(take(i, a));
        i += 1;
        break;
      case "--steps":
        args.steps = Number(take(i, a));
        i += 1;
        break;
      case "--seed":
        args.seed = Number(take(i, a));
        i += 1;
        break;
      case "--out":
        args.out = take(i, a);
        i += 1;
        break;
      default:
        fail(`unknown argument "${a}" (see --help)`);
    }
  }
  for (const key of ["scenarios", "steps", "seed"]) {
    if (!Number.isInteger(args[key]) || args[key] < 0) {
      fail(`--${key} must be a non-negative integer (got "${args[key]}")`);
    }
  }
  if (args.scenarios < 1 || args.steps < 1) {
    fail("--scenarios and --steps must be >= 1");
  }
  if (typeof args.out !== "string" || args.out.length === 0) {
    fail("--out must be a non-empty path");
  }
  return args;
}

/** v = (s × M + j) mod 100 — spreads the steps over the 100 definitions. */
function variant(s, j, m) {
  return (s * m + j) % 100;
}

/** keyword = KEYWORDS[(j + seed mod 3) mod 3] — the seed shifts the rotation. */
function keyword(j, seed) {
  return KEYWORDS[(j + (seed % 3)) % 3];
}

function featureSource(n, m, seed) {
  const lines = [`Feature: Stress ${n} by ${m}`, ""];
  for (let s = 1; s <= n; s++) {
    lines.push(`  Scenario: scenario ${s}`);
    for (let j = 1; j <= m; j++) {
      lines.push(
        `  ${keyword(j, seed)} step ${j} of scenario ${s} variant ${variant(s, j, m)}`,
      );
    }
  }
  return lines.join("\n") + "\n";
}

function phpSource() {
  const lines = ["<?php", "", "class StressContext", "{"];
  for (let k = 0; k < 100; k++) {
    lines.push(
      "    /**",
      `     * @Given /step (?P<j>\\d+) of scenario \\d+ variant ${k}$/`,
      "     */",
      `    public function step${k}($j)`,
      "    {",
      "    }",
      "",
    );
  }
  lines.push("}");
  return lines.join("\n") + "\n";
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    mkdirSync(args.out, { recursive: true });
    writeFileSync(
      join(args.out, "stress.feature"),
      featureSource(args.scenarios, args.steps, args.seed),
    );
    writeFileSync(join(args.out, "StressContext.php"), phpSource());
  } catch (err) {
    fail(`cannot write the stress workspace: ${err instanceof Error ? err.message : String(err)}`);
  }
}

main();
