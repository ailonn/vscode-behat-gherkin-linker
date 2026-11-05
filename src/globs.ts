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
