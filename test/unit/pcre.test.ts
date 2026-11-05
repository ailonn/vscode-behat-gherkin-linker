/**
 * PCRE→JS translator (SPEC.md §5 — "PCRE→JS translator — the core risk").
 *
 * One test per row of the SPEC §5 translation table, including every fail-loud
 * case. Every constructed RegExp must carry the `u` flag: without it, V8
 * silently accepts unsupported PCRE constructs with a different meaning —
 * verified on Node 22: `new RegExp("\\Kabc").test("Kabc")` is `true` (the
 * pattern silently matches the literal text "Kabc").
 */
import { describe, expect, it } from "vitest";
import { isRegexPattern, translatePcre } from "../../src/core/pcre";

/** Translates, asserting the expression IS translatable (returns the RegExp). */
function ok(pattern: string): RegExp {
  const result = translatePcre(pattern);
  if (!result.ok) {
    throw new Error(`expected "${pattern}" to be translatable, got: ${result.reason}`);
  }
  return result.regexp;
}

/** Translates, asserting the expression is NOT translatable (returns the reason). */
function rejected(pattern: string): string {
  const result = translatePcre(pattern);
  if (result.ok) {
    throw new Error(`expected "${pattern}" to be untranslatable, got ${result.regexp}`);
  }
  return result.reason;
}

describe("pcre — classification (Behat regex-pattern check)", () => {
  it("recognises a /…/ pattern", () => {
    expect(isRegexPattern("/abc/")).toBe(true);
  });

  it("recognises the alternative delimiters ~ # ` and {…} (Behat RegexPatternPolicy)", () => {
    expect(isRegexPattern("~abc~")).toBe(true);
    expect(isRegexPattern("#abc#")).toBe(true);
    expect(isRegexPattern("`abc`")).toBe(true);
    expect(isRegexPattern("{abc}")).toBe(true);
  });

  it("does not recognise an unclosed delimiter (Behat treats it as a turnip pattern)", () => {
    expect(isRegexPattern("/abc")).toBe(false);
    expect(isRegexPattern("je paie la commande :numero")).toBe(false);
  });

  it("requires only i/m/s/x/u/S modifiers after the closing delimiter", () => {
    expect(isRegexPattern("/abc/i")).toBe(true);
    expect(isRegexPattern("/abc/ix")).toBe(true);
    expect(isRegexPattern("/abc/b")).toBe(false);
  });
});

describe("pcre — delimiters & modifiers (SPEC §5 table)", () => {
  it("strips the delimiters and matches unanchored", () => {
    const re = ok("/abc/");
    expect(re.source).toBe("abc");
    expect(re.test("xxabcyy")).toBe(true);
  });

  it("maps the i modifier", () => {
    expect(ok("/abc/i").test("xxABCyy")).toBe(true);
  });

  it("maps the m modifier (line anchors)", () => {
    const re = ok("/^foo$/m");
    expect(re.test("xx\nfoo")).toBe(true);
    expect(ok("/^foo$/").test("xx\nfoo")).toBe(false);
  });

  it("maps the s modifier to dotAll (same semantics as PCRE single-line)", () => {
    expect(ok("/a.c/s").test("a\nc")).toBe(true);
    expect(ok("/a.c/").test("a\nc")).toBe(false);
  });

  it("accepts the alternative delimiters ~ # ` and {…}", () => {
    expect(ok("~abc~").test("xxabcyy")).toBe(true);
    expect(ok("#abc#").test("xxabcyy")).toBe(true);
    expect(ok("`abc`").test("xxabcyy")).toBe(true);
    expect(ok("{abc}").test("xxabcyy")).toBe(true);
  });

  it("handles an escaped delimiter in the body", () => {
    expect(ok("/a\\/b/").test("xa/by")).toBe(true);
  });

  it("rejects an unterminated pattern (no closing delimiter)", () => {
    expect(rejected("/abc")).toBeTruthy();
  });

  it("rejects an escaped closing delimiter (the pattern is unterminated, as PCRE would)", () => {
    expect(rejected("/a\\/")).toBeTruthy();
  });

  it("rejects trailing content that is not a modifier (PCRE would reject the same)", () => {
    expect(rejected("/abc/b")).toContain("b");
  });

  it("rejects the x modifier (ignore-whitespace, no JS equivalent)", () => {
    expect(rejected("/abc/x")).toContain("x");
  });

  it.each(["U", "A", "D", "J", "X"])("rejects the %s modifier", (mod) => {
    expect(translatePcre(`/abc/${mod}`).ok).toBe(false);
  });

  it("accepts u and S as documented no-ops (u ≈ the always-on JS u flag; S is PCRE JIT-study, no semantic effect)", () => {
    expect(ok("/abc/u").test("xxabcyy")).toBe(true);
    expect(ok("/abc/S").test("xxabcyy")).toBe(true);
  });

  it("always builds the RegExp with the u flag", () => {
    expect(ok("/abc/").flags).toContain("u");
    expect(ok("/abc/ims").flags).toContain("u");
  });
});

describe("pcre — named groups & backreferences (SPEC §5 table)", () => {
  it("translates (?P<name>…) to JS (?<name>…)", () => {
    const re = ok("/a(?P<n>b)c/");
    expect(re.source).toContain("(?<n>");
    const match = re.exec("abc");
    expect(match?.groups).toEqual({ n: "b" });
  });

  it("translates (?P=name) to JS \\k<name>", () => {
    const re = ok("/(?P<w>w)b(?P=w)/");
    // full match: capture "w" + literal "b" + backreference "w" = "wbw"
    expect(re.test("wbw")).toBe(true);
    expect(re.test("wbb")).toBe(false);
  });

  it("passes through numeric backreferences \\1 (ES2018+)", () => {
    const re = ok("/(a)\\1/");
    expect(re.test("aa")).toBe(true);
    expect(re.test("ab")).toBe(false);
  });

  it("passes through lookbehind (?<=…) / (?<!…) (ES2018+)", () => {
    expect(ok("/(?<=foo)bar/").test("foobar")).toBe(true);
    expect(ok("/(?<!foo)bar/").test("xxbar")).toBe(true);
    expect(ok("/(?<!foo)bar/").test("foobar")).toBe(false);
  });

  it("accepts a capture group whose text starts with a capital P (e.g. (Paris))", () => {
    const re = ok("/(Paris)/"); // was rejected by the (?P… guard before the fix
    expect(re.test("xParisx")).toBe(true); // unanchored (SPEC §5) — the group matches inside longer text
    expect(re.test("xparisx")).toBe(false); // case-sensitive (no i flag) — a real negative case
  });

  it("rejects (?Pabc) with the explicit named-group guard (not the JS constructor error)", () => {
    expect(rejected("/(?Pabc)x/")).toContain("named-group");
  });

  it("rejects (?P=<invalid name>) with the explicit named-group guard (homogeneous diagnostic)", () => {
    // PCRE2: a name must start with a letter or underscore — (?P=123) is a
    // compile error ("subpattern name must start with a non-digit"), not a
    // valid backreference. The diagnostic must be the named-group one, not
    // the generic JS constructor message ("Invalid group").
    expect(rejected("/(?P=123)x/")).toContain("named-group");
  });

  it("rejects (?P<1abc>…) with the explicit named-group guard (homogeneous diagnostic)", () => {
    // Same class of hole on the group-definition form.
    expect(rejected("/(?P<1abc>x/")).toContain("named-group");
  });

  it("keeps (?P< literal inside a character class (no rewrite — PCRE fidelity)", () => {
    // [(?P<] is a class of the literal characters ( ? P < — valid PCRE2.
    // It must still match "P" after translation (the old global rewrite
    // turned it into [(?<], silently dropping the P).
    const re = ok("/[(?P<]/");
    expect(re.test("P")).toBe(true);
    expect(re.test("x")).toBe(false);
  });
});

describe("pcre — inline flags (SPEC §5 table: single leading occurrence only)", () => {
  it("hoists a leading (?i)", () => {
    const re = ok("/(?i)abc/");
    expect(re.source).not.toContain("(?i)");
    expect(re.test("xxABCyy")).toBe(true);
  });

  it("hoists a leading (?s)", () => {
    expect(ok("/(?s)a.c/").test("a\nc")).toBe(true);
  });

  it("hoists a leading (?m)", () => {
    expect(ok("/(?m)^a/").test("b\na")).toBe(true);
  });

  it("fails loud on an inline flag not at the start", () => {
    expect(rejected("/a(?i)b/")).toBeTruthy();
  });

  it("fails loud on a second inline flag occurrence", () => {
    expect(rejected("/(?i)a(?s)b/")).toBeTruthy();
  });

  it("fails loud on scoped flags (?i:…)", () => {
    expect(rejected("/(?i:abc)x/")).toBeTruthy();
  });

  it("fails loud on (?-i) (flag toggling is out of scope)", () => {
    expect(rejected("/(?-i)abc/")).toBeTruthy();
  });
});

describe("pcre — unicode properties (SPEC §5 table)", () => {
  it("passes through \\p{L} (ES2018+ with the u flag)", () => {
    expect(ok("/\\p{L}+/").test("héllo")).toBe(true);
  });

  it("fails loud on an unknown property (constructor error, caught)", () => {
    expect(rejected("/\\p{Foo}/")).toBeTruthy();
  });
});

describe("pcre — fail loud (SPEC §5: never a RegExp, never a false match)", () => {
  it("the \\K trap: untranslatable — and the silent false match it prevents", () => {
    const why = rejected("/\\Kx/");
    expect(why).toContain("\\K");
    // Danger the guard exists for (SPEC §5, verified on Node 22/V8): without the
    // `u` flag, V8 silently treats \K as the literal letter K — the pattern
    // "\Kabc" matches the text "Kabc".
    expect(new RegExp("\\Kabc").test("Kabc")).toBe(true);
  });

  it("rejects \\A outside a character class", () => {
    expect(rejected("/\\Aabc/")).toContain("\\A");
  });

  it("rejects \\z outside a character class", () => {
    expect(rejected("/abc\\z/")).toContain("\\z");
  });

  it("accepts [\\K] inside a character class (literal K, exactly as PCRE)", () => {
    const re = ok("/[\\K]x/");
    expect(re.test("Kx")).toBe(true);
  });

  it.each([
    ["++", "/(a)++/"],
    ["*+", "/\\d*+/"],
    ["?+", "/\\d?+/"],
    ["{n,m}+", "/\\d{2,3}+/"],
  ])("rejects the possessive quantifier %s", (_label, pattern) => {
    expect(translatePcre(pattern).ok).toBe(false);
  });

  it("accepts [*+] inside a character class (literals, not a quantifier)", () => {
    expect(ok("/[*+]/").test("x*")).toBe(true);
  });

  it("rejects the atomic group (?>…)", () => {
    expect(rejected("/(?>ab)/")).toContain("(?>");
  });

  it("rejects the PCRE comment (?#…)", () => {
    expect(rejected("/(?#c)x/")).toBeTruthy();
  });

  it("rejects the PCRE named backreference (?&name)", () => {
    expect(rejected("/(?&x)(a)/")).toBeTruthy();
  });

  it("rejects unsupported letter escapes (\\a, \\Q, \\u) — JS-u identity would diverge from PCRE", () => {
    expect(rejected("/\\ax/")).toContain("\\a");
    expect(rejected("/\\Qx/")).toContain("\\Q");
    expect(rejected("/\\ux/")).toContain("\\u");
  });

  it("rejects \\x{…} (PCRE codepoint escape — JS uses \\u{…}; reported v0.1.1, SPEC §5)", () => {
    expect(rejected("/\\x{2603}/")).toContain("\\x");
  });

  it("translates \\< and \\> to the literal < and > (PCRE2 — not word boundaries)", () => {
    // PCRE2: \< and \> are the LITERAL characters < and >, not word boundaries
    // (verified 2026-11-04 with grep -P/libpcre2 and the PCRE2 manual:
    // backslash + non-alphanumeric = literal; the only word-boundary
    // compatibility is the POSIX [:<:]/[>:] classes).
    expect(ok("/\\<x/").test("foo x")).toBe(false); // discriminator: the old \b mapping matched
    expect(ok("/\\<x/").test("<x")).toBe(true);
    expect(ok("/\\<x/").test("foox")).toBe(false);
    expect(ok("/x\\>/").test("x y")).toBe(false); // discriminator: the old \b mapping matched
    expect(ok("/x\\>/").test("x>")).toBe(true);
    expect(ok("/x\\>/").test("xy")).toBe(false);
  });

  it("rejects \\a \\e \\g \\u inside a character class (PCRE control characters vs JS literal letters)", () => {
    expect(translatePcre("/[\\a]/").ok).toBe(false);
    expect(translatePcre("/[\\e]/").ok).toBe(false);
    expect(translatePcre("/[\\g]/").ok).toBe(false);
    expect(translatePcre("/[\\u0041]/").ok).toBe(false);
  });

  it("surfaces a JS constructor error as an explicit reason", () => {
    expect(rejected("/(?:/")).toBeTruthy();
  });
});
