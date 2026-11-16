/**
 * Contract docstring guard (G2) — the docstrings of the acceptance
 * contracts (features/*.feature) are a lock on the fixtures they describe:
 * every non-blank line of a docstring (trimmed) must appear, IN ORDER, in
 * the fixture file it references — the fixture is the superset (it may
 * carry more than the contract quotes, e.g. the orphan method of
 * CommandeSteps.php that the navigation contract does not show).
 *
 * Mode: contract lock (green on the delivered code — the complementary
 * mode of the predictive test): the moment a fixture drifts from what the
 * contract quotes, the guard fails loud on the first line that no longer
 * matches. The matcher itself is new code — it carries predictive tests
 * (including the rejection cases) in the first describe block.
 *
 * Resolution of the referenced fixture: the last backticked file name in
 * the step that carries the docstring and ends in `.feature` or `.php`
 * (the docstring follows its subject) → `test/fixtures/<basename>`.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateMessages } from "@cucumber/gherkin";
import { IdGenerator, SourceMediaType } from "@cucumber/messages";

const GUARDS_DIR = import.meta.dirname;
const REPO = join(GUARDS_DIR, "..", "..");
const FEATURES_DIR = join(REPO, "features");
const FIXTURES_DIR = join(REPO, "test", "fixtures");

// --- the matcher (new code — predictive tests first) --------------------------

/**
 * Ordered subsequence of lines: every non-blank line of `sub` (trimmed, in
 * its order) is found in `superLines` (trimmed), the search resuming after
 * the previous match. A superset with extra lines is accepted — a missing
 * line or an out-of-order line is not.
 */
const firstMissingLine = (sub: readonly string[], superLines: readonly string[]): string | null => {
  const needle = sub.map((l) => l.trim()).filter((l) => l.length > 0);
  const hay = superLines.map((l) => l.trim()).filter((l) => l.length > 0);
  let i = 0;
  for (const n of needle) {
    i = hay.indexOf(n, i);
    if (i === -1) return n;
    i += 1;
  }
  return null;
};

const isOrderedLineSubsequence = (sub: readonly string[], superLines: readonly string[]): boolean =>
  firstMissingLine(sub, superLines) === null;

describe("isOrderedLineSubsequence (matcher — predictive tests)", () => {
  it("accepts an identical sequence", () => {
    expect(isOrderedLineSubsequence(["a", "b", "c"], ["a", "b", "c"])).toBe(true);
  });
  it("accepts a subsequence with extra lines in the superset (the fixture is the superset)", () => {
    expect(isOrderedLineSubsequence(["a", "c"], ["a", "x", "c", "y"])).toBe(true);
  });
  it("trims the lines and skips the blank lines on both sides", () => {
    expect(isOrderedLineSubsequence(["  a  ", "", "b"], ["x", "a", "", "", "b"])).toBe(true);
  });
  it("rejects a line missing from the superset", () => {
    expect(isOrderedLineSubsequence(["a", "z"], ["a", "b"])).toBe(false);
  });
  it("rejects an out-of-order line", () => {
    expect(isOrderedLineSubsequence(["b", "a"], ["a", "b"])).toBe(false);
  });
  it("keeps the order across repeated lines (no cross-match)", () => {
    expect(isOrderedLineSubsequence(["a", "b", "a"], ["a", "b", "a"])).toBe(true);
    expect(isOrderedLineSubsequence(["a", "b", "a"], ["a", "a", "b"])).toBe(false);
  });
  it("reports the first line that no longer matches (fail-loud detail) — or null", () => {
    expect(firstMissingLine(["a", "z", "c"], ["a", "b", "c"])).toBe("z");
    expect(firstMissingLine(["a", "b"], ["a", "b"])).toBe(null);
  });
});

// --- the guard (contract lock) --------------------------------------------------

interface DocStringStep {
  readonly text: string;
  readonly line: number;
  readonly docString: string;
}

/** Walk the Gherkin AST — collect every step that carries a docstring. */
const collectDocStringSteps = (node: unknown, acc: DocStringStep[]): void => {
  if (node === null || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  if (typeof obj.text === "string" && obj.docString !== null && typeof obj.docString === "object") {
    const content = (obj.docString as { content?: unknown }).content;
    if (typeof content === "string") {
      const loc = obj.location as { line?: number } | undefined;
      acc.push({ text: obj.text, line: loc?.line ?? 0, docString: content });
    }
  }
  for (const value of Object.values(obj)) collectDocStringSteps(value, acc);
};

/** The last backticked file name of the step ending in .feature/.php — the docstring's subject. */
const referencedFixture = (stepText: string): string | null => {
  const refs = (stepText.match(/`([^`]+)`/g) ?? [])
    .map((t) => t.slice(1, -1))
    .filter((t) => /\.(feature|php)$/.test(t));
  return refs.length > 0 ? refs[refs.length - 1] : null;
};

describe("contract docstring guard (G2) — docstring⊆fixture (contract lock)", () => {
  const problems: string[] = [];
  const checked: { file: string; line: number; fixture: string }[] = [];

  for (const file of readdirSync(FEATURES_DIR).filter((f) => f.endsWith(".feature")).sort()) {
    const text = readFileSync(join(FEATURES_DIR, file), "utf8");
    let feature: unknown;
    try {
      const envelopes = generateMessages(
        text,
        `features/${file}`,
        SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN,
        { includeGherkinDocument: true, includePickles: false, newId: IdGenerator.incrementing() }
      );
      const parseErrors = envelopes.flatMap((m) => (m.parseError !== undefined ? [m.parseError.message] : []));
      if (parseErrors.length > 0) throw new Error(parseErrors.join("\n"));
      feature = envelopes.find((m) => m.gherkinDocument !== undefined)?.gherkinDocument?.feature;
      if (!feature) throw new Error("no feature in the parsed document");
    } catch (err) {
      problems.push(`${file}: the contract does not parse — ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    const steps: DocStringStep[] = [];
    collectDocStringSteps(feature, steps);
    for (const s of steps) {
      const ref = referencedFixture(s.text);
      if (ref === null) {
        problems.push(
          `${file}:${s.line}: a docstring step without a referenced fixture (a backticked .feature/.php name): ${s.text}`
        );
        continue;
      }
      const fixtureName = basename(ref);
      const fixturePath = join(FIXTURES_DIR, fixtureName);
      if (!existsSync(fixturePath)) {
        problems.push(`${file}:${s.line}: the referenced fixture test/fixtures/${fixtureName} does not exist (referenced as \`${ref}\`)`);
        continue;
      }
      const fixtureLines = readFileSync(fixturePath, "utf8").split(/\r?\n/);
      const missing = firstMissingLine(s.docString.split(/\r?\n/), fixtureLines);
      if (missing !== null) {
        problems.push(
          `${file}:${s.line}: docstring line no longer found (in order) in test/fixtures/${fixtureName}: ${JSON.stringify(missing)}`
        );
      }
      checked.push({ file, line: s.line, fixture: fixtureName });
    }
  }

  it("every contract docstring is an ordered subsequence of the fixture it references", () => {
    expect(problems, checked.map((c) => `${c.file}:${c.line} → ${c.fixture}`).join(" · ")).toEqual([]);
  });

  it("the lock is non-vacuous — exactly the three contract docstrings are checked (2 navigation, 1 gherkin-dialects)", () => {
    expect(checked.map((c) => `${c.file} → ${c.fixture}`).sort()).toEqual(
      [
        "gherkin-dialects.feature → orders_en.feature",
        "navigation.feature → CommandeSteps.php",
        "navigation.feature → commandes.feature",
      ].sort()
    );
  });
});
