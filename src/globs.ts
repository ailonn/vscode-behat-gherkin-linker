/**
 * Glob setting normalization (pure — no vscode import).
 *
 * `gherkinBehat.features` / `gherkinBehat.steps` accept a string or an array
 * of globs (package.json `"type": ["string", "array"]`); both are normalized
 * to a string array. The configured value is untrusted JSON, so the input
 * type is `unknown`: non-strings and empty entries are dropped. `readSettings`
 * (settings.ts) applies this to the configuration values — the pure form is
 * unit-tested here, the vscode reading stays in the shell.
 */
export function normalizeGlobs(value: unknown, fallback: string): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string" && v.length > 0);
  }
  if (typeof value === "string" && value.length > 0) {
    return [value];
  }
  return [fallback];
}

/**
 * `gherkinBehat.exclude` normalization (AC-9) — the dedicated sibling of
 * `normalizeGlobs` with the opposite default: UNSET means NOTHING is
 * excluded. `normalizeGlobs` falls back to a single pattern because an
 * unset inclusion must still glob something; an exclude with a fallback
 * pattern would silently drop files — the exact trap the unit tests pin.
 * Same defensive input handling (untrusted JSON: non-string and empty
 * entries dropped, a single string kept as a one-glob array).
 */
export function normalizeExcludes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string" && v.length > 0);
  }
  if (typeof value === "string" && value.length > 0) {
    return [value];
  }
  return [];
}

/**
 * Set difference over file paths (AC-9) — the included paths minus
 * everything the exclude sets carry.
 *
 * `excluded` is one entry per user glob: each entry is a string OR a
 * string array (the union — the shell passes one findFiles() result per
 * exclude glob). The order of `included` is preserved; duplicates of
 * `included` are left to the caller (dedup is the shell's job).
 */
export function subtractExcluded(
  included: readonly string[],
  excluded: readonly (string | readonly string[])[],
): string[] {
  const toRemove = new Set<string>();
  for (const entry of excluded) {
    if (typeof entry === "string") {
      toRemove.add(entry);
    } else {
      for (const path of entry) toRemove.add(path);
    }
  }
  return included.filter((path) => !toRemove.has(path));
}
