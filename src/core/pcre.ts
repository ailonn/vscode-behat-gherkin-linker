/**
 * PCRE→JS translator (SPEC.md §5 — "PCRE→JS translator — the core risk").
 *
 * Behat step regexes are PCRE (PHP); Node `RegExp` is not PCRE. This module
 * translates a verbatim Behat regex expression (delimiters + modifiers, exactly
 * as declared in the docblock) into a JS RegExp, and fails loud on any
 * construct that cannot be translated 1:1 — a RegExp is then NEVER built, so an
 * untranslatable definition can never produce a false match (SPEC §5).
 *
 * Every constructed RegExp carries the `u` flag (SPEC §5, mandatory): without
 * it, V8 silently accepts unsupported PCRE constructs with a different meaning
 * (verified on Node 22: `new RegExp("\\Kabc").test("Kabc")` is `true` — the
 * pattern silently matches the literal text "Kabc").
 *
 * JS-u identity escapes (verified on Node 22/V8): JS `u` mode rejects the
 * identity escapes of `! = < > : # " '` (and of ASCII letters) both outside and
 * inside a character class, and of `-` outside a character class. PCRE treats
 * all of them as literal characters — so they are normalized to the plain
 * character (identical meaning: the character is literal in both languages).
 */

/** Result of a PCRE→JS translation — pure, Result-typed (SPEC §5). */
export type PcreResult =
  | { readonly ok: true; readonly regexp: RegExp }
  | { readonly ok: false; readonly reason: string };

/**
 * Behat's classification rule — an expression is a regex pattern iff it is
 * enclosed by `{…}` or by one of the delimiters `~`, `/`, `#` or backtick, with
 * only `imsxADSUXJu` modifiers after the closing delimiter.
 *
 * Source (verified 2026-11-04, identical in 3.x and 4.x) —
 * `RegexPatternPolicy::supportsPattern()`, successor of the historical
 * `PatternFactory::isRegexPattern()`:
 *   preg_match('/^(?:\{.*\}|([~\/#`]).*\1)[imsxADSUXJu]*$/s', $pattern)
 * https://github.com/Behat/Behat/blob/3.x/src/Behat/Behat/Definition/Pattern/Policy/RegexPatternPolicy.php
 *
 * The JS regex below is that exact rule (same delimiters, same modifier set,
 * same `s` behaviour for multiline patterns).
 */
const REGEX_PATTERN_CHECK = /^(?:\{.*\}|([~/#`]).*\1)[imsxADSUXJu]*$/s;

/** Behat's regex-pattern check (see REGEX_PATTERN_CHECK for the source). */
export function isRegexPattern(expression: string): boolean {
  return REGEX_PATTERN_CHECK.test(expression);
}

/** Modifiers mapped 1:1 to JS flags — same semantics: i, m, and s (dotAll = PCRE single-line). */
const FLAG_MAP: Record<string, string> = { i: "i", m: "m", s: "s" };

/**
 * Accepted no-op modifiers:
 * - PCRE `u` (Unicode subject): the JS `u` flag — always applied per SPEC §5 —
 *   is the closest equivalent, so nothing extra to do;
 * - PCRE `S` (study/JIT compilation): a performance hint with zero semantic effect.
 */
const NOOP_FLAGS = new Set(["u", "S"]);

/**
 * Backslash + letter escapes that are IDENTICAL in PCRE and JS (u mode),
 * outside a character class — every other letter escape is rejected (fail
 * loud) because the JS identity fallback would diverge from PCRE (e.g. `\a`
 * = BEL in PCRE, rejected/identity in JS; `\K` = keep-out in PCRE, literal
 * "K" in JS without the flag).
 */
const WHITELISTED_LETTER_ESCAPES = new Set([
  "b", // \b word boundary (both)
  "B", // \B non-word boundary (both)
  "c", // \cX control character (both)
  "d", "D", // digits (both)
  "f", "n", "r", "t", "v", // control characters (both)
  "s", "S", // whitespace (both)
  "w", "W", // word characters (both)
  "x", // \xHH hex (both)
  "p", "P", // \p{…} Unicode properties (both, ES2018+ with u)
  "k", // \k<name> named backreference (both, ES2018+)
]);

/** PCRE control characters that diverge from JS inside a character class (BEL / ESC / GRI / Unicode escape). */
const IN_CLASS_ESCAPES = new Set(["a", "e", "g", "u"]);

/**
 * `\K`/`\A`/`\z`/`\Z` inside a character class are plain literal characters in
 * PCRE (the keep-out / anchors are only special outside a class) — JS `u` mode
 * rejects the escapes, so they are rewritten to the literal character
 * (identical language: PCRE `[\K]` matches exactly "K").
 */
const IN_CLASS_LITERALS = new Map<string, string>([
  ["K", "K"],
  ["A", "A"],
  ["z", "z"],
  ["Z", "Z"],
]);

/**
 * Identity escapes JS-u rejects everywhere (outside AND inside a character
 * class) — PCRE treats them as literal characters, so the backslash is dropped
 * (the plain character is literal in both languages, outside a class).
 */
const DROP_IDENTITY_ESCAPES = new Set(["!", "=", "<", ">", ":", "#", "\"", "'"]);

/** Identity escape JS-u rejects outside a character class only (`\-` is valid inside a class). */
const DROP_OUTSIDE_CLASS_ESCAPES = new Set(["-"]);

/**
 * Normalizes the identity escapes that JS `u` mode rejects (see module header)
 * to the plain character — the meaning is identical (literal character in both
 * languages). Used on preg_quote'd turnip patterns (PHP quotes the colon, JS-u
 * rejects `\:`) and on translated regex bodies.
 */
export function normalizeJsIdentityEscapes(text: string): string {
  let out = "";
  let inClass = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (ch === "\\") {
      const next = text.charAt(i + 1);
      if (next !== "") {
        const drop = DROP_IDENTITY_ESCAPES.has(next) || (!inClass && DROP_OUTSIDE_CLASS_ESCAPES.has(next));
        if (drop) {
          out += next;
          i += 1;
          continue;
        }
      }
      out += ch + next;
      i += 1;
      continue;
    }
    if (inClass) {
      if (ch === "]") {
        inClass = false;
      }
    } else if (ch === "[") {
      inClass = true;
    }
    out += ch;
  }
  return out;
}

/**
 * Translates a verbatim Behat regex expression (delimiters + modifiers
 * included) into a JS RegExp.
 *
 * @param expression the expression exactly as declared in the docblock
 *   (e.g. `/je suis "(?P<login>[\w.]+)"/i`).
 */
export function translatePcre(expression: string): PcreResult {
  if (!isRegexPattern(expression)) {
    return {
      ok: false,
      reason: "not a valid regex pattern (delimiters must be {…} or ~ / # / backtick, with only i/m/s/x/u/S modifiers)",
    };
  }

  const opening = expression.charAt(0);
  const closing = opening === "{" ? "}" : opening;

  // PCRE closes the pattern at the FIRST UNESCAPED closing delimiter (a greedy
  // "last occurrence" reading would accept patterns PCRE itself rejects, e.g.
  // `/a/b/` — Behat's own preg_match validation fails there too).
  let close = -1;
  for (let i = 1; i < expression.length; i++) {
    if (expression.charAt(i) === "\\") {
      i += 1; // skip the escaped character
      continue;
    }
    if (expression.charAt(i) === closing) {
      close = i;
      break;
    }
  }
  if (close === -1) {
    return { ok: false, reason: "unterminated pattern: the closing delimiter is missing or escaped" };
  }

  const flags: string[] = [];
  for (const ch of new Set(expression.slice(close + 1))) {
    const mapped = FLAG_MAP[ch];
    if (mapped) {
      flags.push(mapped);
    } else if (!NOOP_FLAGS.has(ch)) {
      return { ok: false, reason: `unsupported PCRE modifier "${ch}"` };
    }
  }

  let body = expression.slice(1, close);

  // Inline flags — supported ONLY as a single occurrence at the very start of
  // the expression: hoisted into the RegExp flags (SPEC §5 table).
  const leading = /^\(\?([ims])\)/.exec(body);
  if (leading) {
    if (!flags.includes(leading[1])) {
      flags.push(leading[1]);
    }
    body = body.slice(leading[0].length);
  }

  // PCRE named groups (?P<name> / (?P=name) → JS (?<name> / \k<name>) are
  // handled by scanAndRewrite — it is character-class aware, where a global
  // rewrite is not (inside a class the construct is literal text).

  const scan = scanAndRewrite(body);
  if (scan.problem) {
    return { ok: false, reason: scan.problem };
  }

  const normalized = normalizeJsIdentityEscapes(scan.body);
  try {
    return { ok: true, regexp: new RegExp(normalized, [...flags, "u"].join("")) };
  } catch (err) {
    return {
      ok: false,
      reason: `invalid regular expression after PCRE→JS translation: ${errorMessage(err)}`,
    };
  }
}

/** Modifier letters Behat's check allows — used to recognise flag constructs `(?…)`. */
const FLAG_CONSTRUCT_CHARS = "-imsxuadjuXU";

/**
 * Left-to-right scan of the translated body:
 * - rejects PCRE constructs with no faithful JS equivalent (fail loud, SPEC §5);
 * - rewrites `\K`/`\A`/`\z`/`\Z` inside a character class to the literal
 *   character (PCRE semantics; JS-u rejects the escape);
 * - rewrites PCRE named groups `(?P<name>` → `(?<name>` and `(?P=name)`
 *   → `\k<name>`, rejecting invalid name shapes (PCRE2: a name must start
 *   with a letter or underscore) with the explicit named-group diagnostic.
 * Tracks character-class context and escape state.
 */
function scanAndRewrite(body: string): { body: string; problem: string | null } {
  let out = "";
  let inClass = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body.charAt(i);

    if (ch === "\\") {
      const next = body.charAt(i + 1);
      if (next !== "") {
        if (inClass) {
          const literal = IN_CLASS_LITERALS.get(next);
          if (literal !== undefined) {
            out += literal;
            i += 1;
            continue;
          }
          if (IN_CLASS_ESCAPES.has(next)) {
            return {
              body: "",
              problem: `PCRE escape \\${next} has no JS character-class equivalent (PCRE control character / Unicode escape; JS would treat it as a literal letter)`,
            };
          }
        } else if (next === "<" || next === ">") {
          // PCRE2: \< and \> are the LITERAL characters < and >, not word
          // boundaries (verified 2026-11-04 with grep -P/libpcre2 and the
          // PCRE2 manual: backslash + non-alphanumeric = literal; the only
          // word-boundary compatibility is the POSIX [:<:]/[>:] classes).
          out += next;
          i += 1;
          continue;
        } else if (/[A-Za-z]/.test(next) && !WHITELISTED_LETTER_ESCAPES.has(next)) {
          return {
            body: "",
            problem: `PCRE escape \\${next} is not supported (no faithful JS equivalent — without the u flag, \\K would silently match the literal text "K…")`,
          };
        }
      }
      out += ch + next;
      i += 1;
      continue;
    }

    if (inClass) {
      if (ch === "]") {
        inClass = false;
      }
      out += ch;
      continue;
    }

    if (ch === "[") {
      inClass = true;
      out += ch;
      continue;
    }

    if (ch === "(") {
      const rest = body.slice(i + 1);
      if (rest.startsWith("?>")) {
        return { body: "", problem: "atomic group (?>…) is not supported by JS" };
      }
      if (rest.startsWith("#")) {
        return { body: "", problem: "PCRE comment (?#…) is not supported by JS" };
      }
      if (rest.startsWith("&")) {
        return { body: "", problem: "PCRE named backreference (?&name) is not supported by JS (use \\k<name>)" };
      }
      if (rest.startsWith("^")) {
        return { body: "", problem: "PCRE flag reset (?^) is not supported by JS" };
      }
      if (rest.startsWith("?P")) {
        // PCRE named groups (SPEC §5 table): (?P<name> → (?<name>,
        // (?P=name) → \k<name>. PCRE2: a name must start with a letter or
        // underscore — reject invalid shapes here with the explicit
        // diagnostic, instead of the generic JS constructor message.
        const sep = rest.charAt(2);
        if ((sep !== "<" && sep !== "=") || !/^[A-Za-z_]/.test(rest.charAt(3))) {
          return { body: "", problem: "malformed PCRE named-group construct (?P…)" };
        }
        if (sep === "=") {
          // (?P=name) — the name ends at the first ')' (names cannot contain ')').
          const close = rest.indexOf(")");
          if (close !== -1) {
            const name = rest.slice(3, close);
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
              return { body: "", problem: "malformed PCRE named-group construct (?P…)" };
            }
            out += `\\k<${name}>`;
            i += close + 1;
            continue;
          }
          // unterminated (?P=name — fall through (the JS constructor
          // reports the invalid group, as before).
        } else {
          // (?P<name> — the name ends at the first '>' (names cannot contain '>').
          const close = rest.indexOf(">");
          if (close !== -1) {
            const name = rest.slice(3, close);
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
              return { body: "", problem: "malformed PCRE named-group construct (?P…)" };
            }
          }
          // Emit the JS named-group prefix and rescan from the name — the
          // name characters and the closing '>' pass through as literals.
          out += "(?<";
          i += 3;
          continue;
        }
      }
      let j = 1;
      while (j < rest.length && FLAG_CONSTRUCT_CHARS.includes(rest.charAt(j))) {
        j += 1;
      }
      if (j > 1 && (rest.charAt(j) === ")" || rest.charAt(j) === ":")) {
        const kind = rest.charAt(j) === ":" ? "scoped flag (?…:…)" : "inline flag (?…)";
        return {
          body: "",
          problem: `${kind} is not supported (only a single leading (?i)/(?m)/(?s) is translated)`,
        };
      }
      out += ch;
      continue;
    }

    if (ch === "?" || ch === "*" || ch === "+") {
      if (body.charAt(i + 1) === "+") {
        return { body: "", problem: "possessive quantifier is not supported by JS" };
      }
      out += ch;
      continue;
    }

    if (ch === "{") {
      const quantifier = /^\{(\d+)(,\d*)?\}/.exec(body.slice(i));
      if (quantifier && body.charAt(i + quantifier[0].length) === "+") {
        return { body: "", problem: "possessive quantifier is not supported by JS" };
      }
    }

    out += ch;
  }
  return { body: out, problem: null };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
