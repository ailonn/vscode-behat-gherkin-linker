/**
 * Matcher — Behat-exact matching semantics (SPEC.md §5).
 *
 * Verified 2026-11-04 against the official Behat source (identical in 3.x/4.x):
 * - **Type-agnostic** — `RepositorySearchEngine::searchDefinition()` iterates
 *   over EVERY environment definition and `match()` uses only `getPattern()`;
 *   the Given/When/Then type is never part of the match. Hence these functions
 *   take NO type parameter: https://github.com/Behat/Behat/blob/3.x/src/Behat/Behat/Definition/Search/RepositorySearchEngine.php
 * - **regex expressions** → `preg_match` semantics: unanchored
 *   (`PatternTransformer::matchPattern`): https://github.com/Behat/Behat/blob/3.x/src/Behat/Behat/Definition/Pattern/PatternTransformer.php
 * - **`:param` expressions** → the whole pattern preg_quote'd, each `:name`
 *   replaced by the official token, anchored `/^…$/iu`
 *   (`TurnipPatternPolicy::createTransformedRegex`): https://github.com/Behat/Behat/blob/3.x/src/Behat/Behat/Definition/Pattern/Policy/TurnipPatternPolicy.php
 * - Classification rule: `RegexPatternPolicy::supportsPattern`
 *   (re-exported from `./pcre.js`): https://github.com/Behat/Behat/blob/3.x/src/Behat/Behat/Definition/Pattern/Policy/RegexPatternPolicy.php
 */
import type { CompiledDefinition } from "./types.js";
import { isRegexPattern, normalizeJsIdentityEscapes, translatePcre } from "./pcre.js";

/**
 * Behat's official token for a `:name` placeholder
 * (`TurnipPatternPolicy::TOKEN_REGEX`, identical in 3.x/4.x):
 *
 *   ["']?(?P<name>(?<=\")[^\"]*(?=\")|(?<=')[^']*(?=')|-?[\w\.\,]+)['\"]?
 *
 * JS-u adaptation: the escaped quotes `\"`/`\'` and the escaped comma `\,`
 * cannot appear outside a character class in a JS `u`-mode pattern
 * (verified: SyntaxError "Invalid escape") — unescaped they are byte-identical
 * in meaning, so the token keeps Behat's exact semantics: quoted string,
 * bare word, or number (comma-tolerant, optional minus).
 */
const BEHAT_TOKEN =
  '["\u0027]?(?<__NAME__>(?<=\u0022)[^\u0022]*(?=\u0022)|(?<=\u0027)[^\u0027]*(?=\u0027)|-?[\\w.,]+)[\u0027\u0022]?';

/** Faithful to PHP `preg_quote($pattern, '/')` — the set it quotes, plus the delimiter `/`. */
function pregQuote(text: string): string {
  return text.replace(/[\\^$.+*?(){}\[\]=!<>|:#/-]/g, "\\$&");
}

/**
 * Compiles a verbatim step expression (as declared in the docblock) into a
 * `CompiledDefinition` (SPEC §5):
 * - regex pattern (Behat classification) → PCRE translated to JS, unanchored;
 * - `:param` / plain literal (turnip) → quoted, anchored `^…$`, flags `iu`;
 * - anything that cannot be translated 1:1 → `untranslatable` (fail loud).
 */
export function compileExpression(expression: string): CompiledDefinition {
  if (isRegexPattern(expression)) {
    const translated = translatePcre(expression);
    if (!translated.ok) {
      return { kind: "untranslatable", raw: expression, reason: translated.reason };
    }
    return { kind: "regex", pattern: translated.regexp, raw: expression };
  }
  return compileTurnip(expression);
}

/**
 * Compiles a turnip expression (`:param` pattern or plain literal) — the Behat
 * path for every non-regex pattern (`TurnipPatternPolicy`):
 * `preg_quote` the whole pattern, replace each `\:name` with the official
 * token, anchor `^…$`, flags `iu` (Behat) + `u` (SPEC §5, mandatory).
 */
function compileTurnip(expression: string): CompiledDefinition {
  const untranslatable = (reason: string): CompiledDefinition => ({
    kind: "untranslatable",
    raw: expression,
    reason,
  });

  // Turnip's optional-word `\(`…`\)` and escaped-slash `\/` syntax
  // (TurnipPatternPolicy) are out of v0 scope. Refusing them (instead of
  // reading them as literal text) protects the SPEC §5 invariant: never a
  // false match.
  if (expression.includes("\\(") || expression.includes("\\/")) {
    return untranslatable("turnip optional-word \\(…\\) / escaped-slash syntax is not supported in v0");
  }
  // Turnip's alternative-word syntax: an unescaped slash directly between two
  // word characters means "either word" in Behat.
  if (/\w\/\w/.test(expression)) {
    return untranslatable("turnip alternative-word syntax (word/word) is not supported in v0");
  }

  // Behat quotes the whole pattern (preg_quote), then applies PLACEHOLDER_REGEXP
  // `/\\\:(\w+)/` — preg_quote escapes the colon to `\:`. JS `u` mode rejects
  // `\:` outside a character class, so the quoted text is normalized to the
  // plain colon (identical meaning) and the placeholder scan is equivalent.
  const quoted = normalizeJsIdentityEscapes(pregQuote(expression));
  const names = [...quoted.matchAll(/:(\w+)/g)].map((m) => m[1]);

  for (const name of names) {
    // PCRE named groups must start with a letter or underscore — `:30`
    // (e.g. in "l'heure est 12:30") is rejected by Behat at registration.
    if (!/^[A-Za-z_]/.test(name)) {
      return untranslatable(`token name must start with a letter or underscore (PCRE named-group rule): "${name}"`);
    }
    // TurnipPatternPolicy::replaceTokenWithRegexCaptureGroup — InvalidPatternException.
    if (name.length > 32) {
      return untranslatable(`token name should not exceed 32 characters: "${name}"`);
    }
  }

  if (names.length === 0) {
    // Plain literal — fully quoted, anchored, case-insensitive (Behat /…/iu).
    return { kind: "param", pattern: new RegExp(`^${quoted}$`, "iu"), raw: expression, params: [] };
  }

  const body = quoted.replace(/:(\w+)/g, (_all, name: string) => BEHAT_TOKEN.replace("__NAME__", name));
  try {
    const pattern = new RegExp(`^${body}$`, "iu");
    return { kind: "param", pattern, raw: expression, params: names };
  } catch (err) {
    return untranslatable(`invalid regular expression after :param substitution: ${errMessage(err)}`);
  }
}

/**
 * Does the compiled definition match the step text?
 * **Never throws.** An `untranslatable` definition never matches (fail loud,
 * never a false match — SPEC §5). Type-agnostic: no keyword type is involved.
 */
export function matches(compiled: CompiledDefinition, stepText: string): boolean {
  if (compiled.kind === "untranslatable") {
    return false;
  }
  try {
    return compiled.pattern.test(stepText);
  } catch {
    return false;
  }
}

/**
 * Named-group captures for the step text (hover, lot 3): the named groups of a
 * regex expression, or the `:param` names of a turnip expression (the token's
 * named group — quotes are outside the group, exactly as Behat captures).
 * `null` when there is no match (or the definition is untranslatable);
 * `{}` when there is a match but no named groups. **Never throws.**
 */
export function namedGroups(compiled: CompiledDefinition, stepText: string): Record<string, string> | null {
  if (compiled.kind === "untranslatable") {
    return null;
  }
  try {
    const match = compiled.pattern.exec(stepText);
    if (match === null) {
      return null;
    }
    return match.groups ? { ...match.groups } : {};
  } catch {
    return null;
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
