# QA automation plan (quality-checker step 5)

Cycle 2026-11-09 — wave 3 pre-publication. Reviewed every cycle: what is
automated, what stays manual, what the next cycle absorbs.

## Automated in CI (`.github/workflows/ci.yml`)

| Control | Job | Trigger |
|---|---|---|
| unit: core + shell + packaging lock + stress generator CA + mapping guard (195 tests) | `check` | push/PR |
| e2e 21 + restart 2 (test-electron on xvfb) | `check` | push/PR |
| stress smoke 100×100 (bounded by the locked 55 s budget) | `check` | push/PR |
| vsix content (no test/features/qa/SPEC in the vsix) | `check` | push/PR |
| stress full 1000×1000 (wall-time budget 55 s) + vsix pack (artifact) | `release` | tag `v*` |
| toolchain pinning (pnpm 10.33.2 strict, node 22.14.0 via `.nvmrc`) | both | push/PR + tag |

## Manual (every cycle)

- **Chat-noir discovery** — fresh-context agent breaks the extension; the
  crash registry is consumed (every case run) and grown (new cases get an ID).
- **CRASH-001 execution** — heavy (42 MB workspace, 1M diagnostics): local
  only for now; see candidates.
- **Vsix unpack + tree check** (S6) — the artifact is the release input.
- **Fresh clone of the public repo** (S8) — once per release (install → full
  suite → pack).
- **PO signature of the stress budget** (F3) — the number is mechanical
  (`ceil(baseline × 3, 5 s)`), the signature is a human decision.

## Candidates for the next cycle

- **CRASH-001 in CI at reduced scale** — 10k undefined steps exercises the
  same flooding mechanism (one huge `collection.set` of ERROR diagnostics)
  ~100× cheaper; would move the case from manual to the `check` job.
- _(new candidates land here each cycle — the plan is a living document.)_
