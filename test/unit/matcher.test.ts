/**
 * Matcher — Behat-exact matching semantics (SPEC.md §5).
 *
 * Claims verified 2026-11-04 against the official Behat source (3.x and 4.x
 * carry the identical code):
 *
 * 1. Classification — an expression is a regex pattern iff it is enclosed by
 *    `{…}` or by one of the delimiters `~ / # ` ` `, with only `imsxADSUXJu`
 *    modifiers after the closing delimiter. `RegexPatternPolicy::supportsPattern()`
 *    (successor of the historical `PatternFactory`):
 *      preg_match('/^(?:\{.*\}|([~\/#`]).*\1)[imsxADSUXJu]*$/s', $pattern)
 *    https://github.com/Behat/Behat/blob/3.x/src/Behat/Behat/Definition/Pattern/Policy/RegexPatternPolicy.php
 *
 * 2. `:param` (turnip) — the whole pattern is preg_quote'd, each `:name`
 *    (PLACEHOLDER_REGEXP `/\\\:(\w+)/`) is replaced by the official token
 *    TOKEN_REGEX `["']?(?P<name>(?<=\")[^\"]*(?=\")|(?<=')[^']*(?=')|-?[\w\.\,]+)['\"]?`,
 *    anchored `/^…$/iu`; a token name must not exceed 32 characters
 *    (InvalidPatternException). `TurnipPatternPolicy::createTransformedRegex()`:
 *    https://github.com/Behat/Behat/blob/3.x/src/Behat/Behat/Definition/Pattern/Policy/TurnipPatternPolicy.php
 *
 * 3. Unanchored regex matching — `PatternTransformer::matchPattern()` calls
 *    `preg_match($regex, $stepText)` without anchors:
 *    https://github.com/Behat/Behat/blob/3.x/src/Behat/Behat/Definition/Pattern/PatternTransformer.php
 *
 * 4. Type-agnostic — `RepositorySearchEngine::searchDefinition()` iterates over
 *    EVERY environment definition and `match()` uses only `getPattern()`; the
 *    Given/When/Then type is never part of the match:
 *    https://github.com/Behat/Behat/blob/3.x/src/Behat/Behat/Definition/Search/RepositorySearchEngine.php
 */
import { describe, expect, it } from "vitest";
import type { CompiledDefinition } from "../../src/core/types.js";
import { compileExpression, matches, namedGroups } from "../../src/core/matcher.js";

describe("matcher — classification (Behat RegexPatternPolicy::supportsPattern)", () => {
  it("treats a /…/ pattern as a regex", () => {
    const compiled = compileExpression('/je valide la commande "(?P<numero>[\w.]+)"/');
    expect(compiled.kind).toBe("regex");
  });

  it("treats the alternative delimiters ~ # ` {…} as regexes (Behat rule, cited above)", () => {
    expect(compileExpression("~abc~").kind).toBe("regex");
    expect(compileExpression("#abc#").kind).toBe("regex");
    expect(compileExpression("`abc`").kind).toBe("regex");
    expect(compileExpression("{abc}").kind).toBe("regex");
  });

  it("treats an unclosed delimiter as a literal, not a regex (the Behat check fails: no closing delimiter)", () => {
    const compiled = compileExpression("/abc");
    expect(compiled.kind).toBe("param");
    if (compiled.kind === "param") {
      expect(compiled.params).toEqual([]);
      expect(matches(compiled, "/abc")).toBe(true);
      expect(matches(compiled, "x/abc")).toBe(false); // anchored ^…$
    }
  });

  it("treats a text with :param as a turnip pattern", () => {
    const compiled = compileExpression("je paie la commande :numero");
    expect(compiled.kind).toBe("param");
    if (compiled.kind === "param") {
      expect(compiled.params).toEqual(["numero"]);
    }
  });

  it("keeps the verbatim expression in raw", () => {
    expect(compileExpression("/abc/i").raw).toBe("/abc/i");
    expect(compileExpression("je paie :n").raw).toBe("je paie :n");
  });

  it("classifies before translating: an untranslatable regex stays untranslatable (never re-read as a turnip literal)", () => {
    const compiled = compileExpression("/a\\Kb/");
    expect(compiled.kind).toBe("untranslatable");
  });
});

describe("matcher — regex semantics (preg_match: unanchored, SPEC §5)", () => {
  const compiled = compileExpression('/je valide la commande "(?P<numero>[\\w.]+)"/');

  it("matches a step with a suffix after the pattern (SPEC case: the suffix does not block)", () => {
    // The brief's example value "CMD-2026" is kept as a NEGATIVE assertion
    // below: under strict PCRE (and therefore in Behat itself), `[\w.]` cannot
    // capture a hyphen — the unanchored rule is verified with a hyphen-free value.
    expect(matches(compiled, 'je valide la commande "CMD2026" avec succès')).toBe(true);
  });

  it("stays faithful to the capture class: [\\w.] does not cover a hyphen (the brief's \"CMD-2026\" example does not match — identical in Behat)", () => {
    expect(matches(compiled, 'je valide la commande "CMD-2026" avec succès')).toBe(false);
  });

  it("does not match a text the pattern does not describe", () => {
    expect(matches(compiled, 'la commande "CMD-2026" est valide')).toBe(false);
  });

  it("applies the expression's own modifiers", () => {
    expect(matches(compileExpression("/ABC/i"), "xxabcyy")).toBe(true);
  });
});

describe("matcher — :param semantics (official Behat token, anchored, flags iu)", () => {
  const pay = compileExpression("je paie la commande :numero");

  it("captures a double-quoted string", () => {
    expect(matches(pay, 'je paie la commande "CMD-2026"')).toBe(true);
    expect(namedGroups(pay, 'je paie la commande "CMD-2026"')).toEqual({ numero: "CMD-2026" });
  });

  it("captures a single-quoted string", () => {
    expect(matches(pay, "je paie la commande 'CMD-2026'")).toBe(true);
    expect(namedGroups(pay, "je paie la commande 'CMD-2026'")).toEqual({ numero: "CMD-2026" });
  });

  it("captures a bare word (dots allowed)", () => {
    expect(matches(compileExpression("je suis :login"), "je suis marie.dupont")).toBe(true);
    expect(namedGroups(compileExpression("je suis :login"), "je suis marie.dupont")).toEqual({
      login: "marie.dupont",
    });
  });

  it("captures a number, positive and negative (-? in the token)", () => {
    const n = compileExpression("il y a :n pommes");
    expect(matches(n, "il y a 42 pommes")).toBe(true);
    expect(namedGroups(n, "il y a 42 pommes")).toEqual({ n: "42" });
    expect(matches(n, "il y a -7 pommes")).toBe(true);
    expect(namedGroups(n, "il y a -7 pommes")).toEqual({ n: "-7" });
  });

  it("captures a comma-tolerant amount ([\\w.,]+ in the token)", () => {
    const m = compileExpression("montant :m");
    expect(matches(m, "montant 1,5")).toBe(true);
    expect(namedGroups(m, "montant 1,5")).toEqual({ m: "1,5" });
  });

  it("is anchored ^…$: a prefix or a suffix breaks the match", () => {
    expect(matches(pay, 'quand je paie la commande "C-1"')).toBe(false);
    expect(matches(pay, 'je paie la commande "C-1" merci')).toBe(false);
  });

  it("is case-insensitive (flag i, as in Behat /…/iu)", () => {
    expect(matches(pay, 'JE PAIE LA COMMANDE "C-1"')).toBe(true);
  });

  it("quotes the literal parts: special characters are NOT wildcards (SPEC case)", () => {
    const version = compileExpression("version 1.0 :x");
    expect(matches(version, "version 1X0 y")).toBe(false); // `.` is a literal dot, not `.`
    expect(matches(version, "version 1.0 y")).toBe(true);
  });

  it("compiles several parameters (in order)", () => {
    const go = compileExpression("je vais de :a à :b");
    expect(go.kind).toBe("param");
    if (go.kind === "param") {
      expect(go.params).toEqual(["a", "b"]);
    }
    expect(matches(go, "je vais de Paris à Lyon")).toBe(true);
    expect(namedGroups(go, "je vais de Paris à Lyon")).toEqual({ a: "Paris", b: "Lyon" });
  });
});

describe("matcher — plain literal semantics (no delimiters, no :param)", () => {
  const literal = compileExpression("je valide");

  it("matches exactly, case-insensitively, anchored", () => {
    expect(matches(literal, "je valide")).toBe(true);
    expect(matches(literal, "JE VALIDE")).toBe(true);
    expect(matches(literal, "je validee")).toBe(false);
    expect(matches(literal, "x je valide")).toBe(false);
  });
});

describe("matcher — untranslatable (fail loud: never a false match)", () => {
  const broken = compileExpression("/a\\Kb/");

  it("is flagged with a reason", () => {
    expect(broken.kind).toBe("untranslatable");
    if (broken.kind === "untranslatable") {
      expect(broken.reason.length).toBeGreaterThan(0);
      expect(broken.raw).toBe("/a\\Kb/");
    }
  });

  it("never matches and never captures", () => {
    expect(matches(broken, "ab")).toBe(false);
    expect(namedGroups(broken, "ab")).toBeNull();
  });

  it("rejects a numeric-only token name (PCRE named groups must start with a letter or underscore)", () => {
    const compiled = compileExpression("l'heure est 12:30");
    expect(compiled.kind).toBe("untranslatable");
  });

  it("rejects a token name over 32 characters (Behat InvalidPatternException)", () => {
    const compiled = compileExpression("a :" + "x".repeat(33) + " b");
    expect(compiled.kind).toBe("untranslatable");
    if (compiled.kind === "untranslatable") {
      expect(compiled.reason).toContain("32");
    }
  });

  it("rejects a duplicate token name", () => {
    expect(compileExpression("a :n b :n").kind).toBe("untranslatable");
  });

  it("rejects the turnip optional-word syntax \\(…\\) (out of v0 scope — refusing protects the no-false-match invariant)", () => {
    const compiled = compileExpression("je paie \\(:numero\\) la commande");
    expect(compiled.kind).toBe("untranslatable");
  });

  it("rejects the turnip alternative-word syntax word/word, but keeps a plain slash outside word adjacency", () => {
    expect(compileExpression("un euro/deux").kind).toBe("untranslatable");
    // "https://x.com": the slash is not directly between two word characters
    expect(compileExpression("je visite https://x.com").kind).toBe("param");
  });
});

describe("matcher — namedGroups (hover lot 3)", () => {
  it("returns the named captures of a regex", () => {
    const compiled = compileExpression('/je suis "(?P<login>[\\w.]+)"/');
    expect(namedGroups(compiled, 'je suis "marie.dupont"')).toEqual({ login: "marie.dupont" });
  });

  it("returns the parameter captures of a :param expression", () => {
    const compiled = compileExpression("je paie la commande :numero");
    expect(namedGroups(compiled, 'je paie la commande "CMD-1111"')).toEqual({ numero: "CMD-1111" });
  });

  it("returns null when there is no match", () => {
    expect(namedGroups(compileExpression("/abc/"), "xx")).toBeNull();
    expect(namedGroups(compileExpression("literal"), "other")).toBeNull();
  });

  it("returns {} when there is a match but no named groups", () => {
    expect(namedGroups(compileExpression("/abc/"), "xxabcxx")).toEqual({});
  });
});

describe("matcher — type-agnostic (claim 4 above: Behat never filters by keyword type)", () => {
  // Signature-level guarantee: matches/namedGroups take (compiled, stepText) —
  // there is NO StepType parameter to carry the Given/When/Then information.
  const _signature: (compiled: CompiledDefinition, stepText: string) => boolean = matches;

  it("matches a Soit step text against a definition declared @Then in the fixture", () => {
    // test/fixtures/CommandeSteps.php declares: @Then /la commande "(?P<numero>[\w.]+)" est valide/
    const compiled = compileExpression('/la commande "(?P<numero>[\\w.]+)" est valide/');
    // The `Soit` steps of test/fixtures/commandes.feature carry this shape
    // (the Gherkin parser strips the keyword before matching — as Behat does).
    // Value without hyphen: `[\w.]` cannot capture "CMD-1111" under strict PCRE
    // (see the ÉCART note in the unanchored tests above).
    expect(matches(compiled, 'la commande "CMD1111" est valide')).toBe(true);
    expect(namedGroups(compiled, 'la commande "CMD1111" est valide')).toEqual({
      numero: "CMD1111",
    });
    void _signature;
  });
});

describe("matcher — no exception (contract: matches/namedGroups never throw)", () => {
  it("survives every kind, including empty and multiline texts", () => {
    const cases: CompiledDefinition[] = [
      compileExpression("/abc/"),
      compileExpression("je paie :n"),
      compileExpression("literal"),
      compileExpression("/a\\Kb/"),
    ];
    for (const compiled of cases) {
      expect(() => matches(compiled, "")).not.toThrow();
      expect(() => matches(compiled, "anything\nwith\nnewlines")).not.toThrow();
      expect(() => namedGroups(compiled, "")).not.toThrow();
      expect(() => namedGroups(compiled, "anything\nwith\nnewlines")).not.toThrow();
    }
  });
});
