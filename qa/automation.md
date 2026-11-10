# QA automation plan (quality-checker step 5)

Cycle 2026-11-09 — wave 3 pre-publication. Reviewed every cycle: what is
automated, what stays manual, what the next cycle absorbs.

## Automated in CI (`.github/workflows/ci.yml`)

| Control | Job | Trigger |
|---|---|---|
| build + typecheck (`pnpm run build` + `pnpm run typecheck:all`) | `check` | push/PR |
| unit: core + shell + packaging lock + stress generator CA + mapping guard (195 tests) | `check` | push/PR |
| e2e 22 + restart 2 (test-electron on xvfb — incl. the CRASH-003 read-failure lock) | `check` | push/PR |
| stress smoke 100×100 (on xvfb — test-electron needs an X server; bounded by the locked 55 s budget) | `check` | push/PR |
| vsix content (no test/features/qa/SPEC in the vsix) | `check` | push/PR |
| stress full 1000×1000 (on xvfb — wall-time budget 55 s) + vsix pack (artifact) | `release` | tag `v*` |
| toolchain pinning (pnpm 10.33.2 strict, node 22.14.0 via `.nvmrc`) | both | push/PR + tag |

## Manual (every cycle)

- **Chat-noir discovery** — fresh-context agent breaks the extension; the
  crash registry is consumed (every case run) and grown (new cases get an ID).
- **CRASH-001 execution** — heavy (42 MB workspace, 1M diagnostics): local
  only for now; see candidates.
- **Vsix unpack + tree check** (S6) — the artifact is the release input.
- **Fresh clone of the public repo** (S8) — once per release (install → full
  suite → pack).
- **PO signature of the stress budget** (F3) — signed 2026-11-10 (gate S9); a
  new signature is required at any re-baseline of the measured budget.

## Candidates for the next cycle

- **CRASH-001 in CI at reduced scale** — 10k undefined steps exercises the
  same flooding mechanism (one huge `collection.set` of ERROR diagnostics)
  ~100× cheaper; would move the case from manual to the `check` job.
- _(new candidates land here each cycle — the plan is a living document.)_
