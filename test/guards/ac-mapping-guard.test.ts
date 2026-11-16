/**
 * AC mapping guard (G1) — the permanent lock of the AC ↔ contract ↔ e2e chain:
 *
 *   SPEC.md §3 table  (source: each AC + its feature file, or `meta`)
 *     ↔ features/*.feature  (@ac-N tags, read through the @cucumber/gherkin AST)
 *     ↔ test/integration/suite.mjs  (e2e titles, locked by the MANIFEST below —
 *       the single source of the expected titles)
 *
 * A lock, not a driver: when an e2e title, a contract tag, or a SPEC row
 * changes, this guard reports the exact diff to fix — a false-but-valid
 * label can no longer ride silently through the suite.
 *
 * Invariants (each fails loud, with the exact diff):
 *   1. each contract's first line is `# language: fr` — the header that
 *      makes the French contracts parseable by the official parser
 *      (AC-6, the `# language:` promise);
 *   2. each contract parses (a Gherkin parse error = guard failure, never
 *      silent);
 *   3. the @ac-N tags of each contract == the ACs whose SPEC §3 row lists
 *      it (both directions — a tag with no row, a row with no tag);
 *   4. every e2e title of the main suite follows the prefix grammar
 *      `AC-n(/AC-n)*: <title>` or `E1: <title>` (the E1 harness smoke is
 *      the only non-AC prefix); an AC prefix must name an AC of the SPEC;
 *   5. the suite's AC titles == the MANIFEST (no unlisted title, no
 *      missing title, no duplicate title);
 *   6. every non-meta AC of SPEC §3 is covered by at least one e2e title —
 *      a composite prefix (`AC-1/AC-2`) counts for every component.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateMessages } from "@cucumber/gherkin";
import { IdGenerator, SourceMediaType } from "@cucumber/messages";

const GUARDS_DIR = import.meta.dirname;
const REPO = join(GUARDS_DIR, "..", "..");
const FEATURES_DIR = join(REPO, "features");
const SUITE = join(REPO, "test", "integration", "suite.mjs");
const SPEC = join(REPO, "SPEC.md");

// --- the manifest — single source of the expected e2e titles (by prefix) ----
// A composite prefix (`AC-1/AC-2`) is its own key: the title is listed once,
// and invariant 6 counts it for every component of the prefix.

const MANIFEST: Record<string, readonly string[]> = {
  "AC-1": [
    "AC-1: feature step → PHP definition (type-agnostic, static, no vendor/)",
    "AC-1: Background step resolves; the scenario step stays type-agnostic",
  ],
  "AC-1/AC-2": [
    "AC-1/AC-2: completeness — the exact location set (no more, no less)",
    "AC-1/AC-2: Scenario Outline — each Examples row resolves (interpolated, per row)",
  ],
  "AC-2": ["AC-2: PHP definition → all matching feature steps (reverse)"],
  "AC-3": [
    "AC-3: undefined step → error diagnostic (commandes.feature line 12)",
    "AC-3: orphan definition → info diagnostic (CommandeSteps.php line 31)",
    "AC-3: duplicate definitions → warning diagnostics (e2e fixture)",
    "AC-3: untranslatable expression → info diagnostic WITH the reason (e2e fixture)",
    "AC-3: unparseable Gherkin → error diagnostic (e2e fixture)",
    "AC-3: unreadable feature file → error diagnostic + partial index (CRASH-003)",
  ],
  "AC-4": [
    "AC-4: hover on a step → FQCN, method, expression (with named groups)",
    "AC-4: hover on a definition → its usages",
    "AC-4: hover on an untranslatable definition → the reason (fail loud)",
    "AC-4: hover on a @Transform docblock line → the definition card",
    "AC-4: hover on an ambiguous step → both matches + the AmbiguousMatchException flag",
  ],
  "AC-5": [
    "AC-5: rebuild — a new feature file is indexed by the watcher",
    "AC-5: vendor/ exclusion — a vendored feature is never indexed",
  ],
  "AC-6": [
    "AC-6: dialects — DE (with header) and EN default (no header) steps resolve",
  ],
  "AC-8": [
    "AC-8: gherkinBehat.orphans=false → the orphan info is off (errors intact) → on",
    "AC-8: gherkinBehat.enabled=false → off switch (diagnostics cleared, providers empty) → on",
  ],
};

/** The only non-AC prefixes allowed in e2e titles (harness smoke). */
const HARNESS_PREFIXES = ["E1"];

// --- parsing helpers ----------------------------------------------------------

/** Minimal structural view of the Gherkin AST — the guard only reads tags. */
type AstNode = { readonly tags?: readonly { readonly name: string }[] } & Record<string, unknown>;

const collectTags = (node: unknown, acc: string[]): void => {
  if (node === null || typeof node !== "object") return;
  const obj = node as AstNode;
  for (const tag of obj.tags ?? []) acc.push(tag.name);
  for (const value of Object.values(obj)) collectTags(value, acc);
};

interface Contract {
  readonly file: string; // e.g. "navigation.feature"
  readonly firstLine: string;
  readonly parseError?: string;
  readonly tags: string[]; // e.g. ["@ac-1", "@ac-2"]
}

const parseContract = (file: string): Contract => {
  const text = readFileSync(join(FEATURES_DIR, file), "utf8");
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  try {
    const envelopes = generateMessages(
      text,
      `features/${file}`,
      SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN,
      { includeGherkinDocument: true, includePickles: false, newId: IdGenerator.incrementing() }
    );
    const parseErrors = envelopes.flatMap((m) => (m.parseError !== undefined ? [m.parseError.message] : []));
    if (parseErrors.length > 0) {
      return { file, firstLine, parseError: parseErrors.join("\n"), tags: [] };
    }
    const feature = envelopes.find((m) => m.gherkinDocument !== undefined)?.gherkinDocument?.feature;
    const tags: string[] = [];
    if (feature) collectTags(feature, tags);
    return { file, firstLine, tags };
  } catch (err) {
    return { file, firstLine, parseError: err instanceof Error ? err.message : String(err), tags: [] };
  }
};

/** One row of the SPEC §3 AC table: the AC + its Gherkin cell. */
interface SpecRow {
  readonly ac: string; // e.g. "AC-3"
  readonly gherkin: string; // a file ("features/x.feature") or a "meta — …" marker
}

const parseSpec = (): SpecRow[] => {
  const text = readFileSync(SPEC, "utf8");
  const section = text
    .split(/^## /m)
    .find((s) => /^3\./.test(s));
  if (!section) throw new Error("SPEC.md: the '## 3.' section was not found");
  const rows: SpecRow[] = [];
  for (const line of section.split(/\r?\n/)) {
    if (!/^\|\s*AC-\d+\s*\|/.test(line)) continue;
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length !== 5 || cells[0] !== "" || cells[4] !== "") {
      throw new Error(`SPEC.md §3: a table row does not carry exactly 3 cells: ${line}`);
    }
    rows.push({ ac: cells[1], gherkin: cells[3].replace(/`/g, "") });
  }
  return rows;
};

/** The e2e titles of the main suite — the top-level `test("…"` registrations. */
const e2eTitles = (): string[] =>
  readFileSync(SUITE, "utf8")
    .split(/\r?\n/)
    .map((line) => line.match(/^test\("(.*)",/)?.[1])
    .filter((t): t is string => t !== undefined);

type ParsedTitle =
  | { readonly kind: "ac"; readonly prefix: string; readonly acs: readonly string[] }
  | { readonly kind: "harness"; readonly prefix: string }
  | { readonly kind: "invalid" };

const parseTitle = (title: string): ParsedTitle => {
  const m = title.match(/^(AC-\d+(?:\/AC-\d+)*|E\d+): (.+)$/);
  if (!m) return { kind: "invalid" };
  if (m[1].startsWith("E")) return { kind: "harness", prefix: m[1] };
  return { kind: "ac", prefix: m[1], acs: m[1].split("/") };
};

/** `@ac-3` / `ac-3` → `AC-3`; anything else is passed through unchanged. */
const toAc = (s: string): string => {
  const m = s.replace(/^@/, "").match(/^ac-(\d+)$/i);
  return m ? `AC-${m[1]}` : s;
};

const isMeta = (gherkin: string): boolean => /^meta\b/.test(gherkin);

// --- invariants ----------------------------------------------------------------

describe("AC mapping guard (G1) — SPEC §3 ↔ features/ ↔ e2e titles", () => {
  const contracts = readdirSync(FEATURES_DIR)
    .filter((f) => f.endsWith(".feature"))
    .sort()
    .map(parseContract);
  const specRows = parseSpec();
  const titles = e2eTitles();

  it("each contract carries `# language: fr` on its first line", () => {
    const bad = contracts.filter((c) => c.firstLine !== "# language: fr");
    expect(
      bad.map((c) => `${c.file}: ${JSON.stringify(c.firstLine)}`),
      "contracts without the `# language: fr` header"
    ).toEqual([]);
  });

  it("every contract parses as Gherkin (a parse error fails the guard)", () => {
    const bad = contracts.filter((c) => c.parseError !== undefined);
    expect(bad.map((c) => `${c.file}: ${c.parseError}`)).toEqual([]);
  });

  it("the @ac-N tags of each contract == the ACs listed in its SPEC §3 row (both directions)", () => {
    const specByFile = new Map<string, string[]>();
    const specFiles: string[] = [];
    for (const row of specRows) {
      if (isMeta(row.gherkin)) continue;
      const file = row.gherkin.replace(/^features\//, "");
      specFiles.push(file);
      specByFile.set(file, [...(specByFile.get(file) ?? []), row.ac]);
    }
    const problems: string[] = [];
    for (const c of contracts) {
      const expected = specByFile.get(c.file);
      if (!expected) {
        problems.push(`${c.file}: no SPEC §3 row lists this contract`);
        continue;
      }
      const got = c.tags.map(toAc);
      const missing = expected.filter((ac) => !got.includes(ac));
      const extra = got.filter((ac) => !expected.includes(ac));
      if (missing.length > 0 || extra.length > 0) {
        problems.push(
          `${c.file}: tags [${[...new Set(got)].join(", ")}] ≠ SPEC [${expected.join(", ")}]` +
            ` (missing: ${missing.join(", ") || "—"}, extra: ${extra.join(", ") || "—"})`
        );
      }
    }
    for (const file of specFiles) {
      if (!contracts.some((c) => c.file === file)) {
        problems.push(`SPEC §3 lists features/${file}, which does not exist in features/`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("every e2e title follows the prefix grammar (AC-n(/AC-n)*: … | E1: …) and names a real AC", () => {
    const problems: string[] = [];
    for (const title of titles) {
      const p = parseTitle(title);
      if (p.kind === "invalid") {
        problems.push(`bad prefix grammar: ${title}`);
      } else if (p.kind === "harness" && !HARNESS_PREFIXES.includes(p.prefix)) {
        problems.push(`unknown harness prefix (${p.prefix}) — only ${HARNESS_PREFIXES.join(", ")}: ${title}`);
      } else if (p.kind === "ac") {
        for (const ac of p.acs) {
          if (!specRows.some((r) => r.ac === ac)) problems.push(`${title}: ${ac} is not in the SPEC §3 table`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("the suite's AC titles == the manifest (no unlisted, no missing, no duplicate title)", () => {
    const manifestTitles = new Set(Object.values(MANIFEST).flat());
    const suiteAcTitles = titles.filter((t) => parseTitle(t).kind === "ac");
    const seen = new Set<string>();
    const dupes = suiteAcTitles.filter((t) => (seen.has(t) ? true : (seen.add(t), false)));
    const unlisted = suiteAcTitles.filter((t) => !manifestTitles.has(t));
    const missing = [...manifestTitles].filter((t) => !titles.includes(t)).sort();
    expect({ dupes: [...new Set(dupes)].sort(), unlisted: unlisted.sort(), missing }).toEqual({
      dupes: [],
      unlisted: [],
      missing: [],
    });
  });

  it("every non-meta AC of SPEC §3 is covered by at least one e2e title", () => {
    const nonMeta = specRows.filter((r) => !isMeta(r.gherkin)).map((r) => r.ac);
    const uncovered = nonMeta.filter(
      (ac) => !titles.some((t) => {
        const p = parseTitle(t);
        return p.kind === "ac" && p.acs.includes(ac);
      })
    );
    expect(uncovered, "non-meta ACs with no e2e title").toEqual([]);
  });
});
