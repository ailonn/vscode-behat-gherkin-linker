# QA scorecard — cycle 2026-11-09 (wave 3, pre-publication v0.1.0)

Product: `vscode-behat-gherkin-linker` · pipe: `quality-checker` (5 steps) · verdict gate: expert-PO + expert-QA (S9, pending)

## Counters (end of cycle)

| Suite | Result | Time |
|---|---|---|
| Unit (core + shell guards + packaging lock) | **195/195** | 444 ms on the dev machine — soft metric, not a gate (the count is; wall time is machine-dependent) |
| E2E (test-electron, real VS Code) | **22/22** (+ restart 2/2) | — |
| Stress full-scale 1000×1000 | **3/3** — CA-5: 16 174 ms ≤ budget **55 s** (F3 locked, baseline 17.9 s) | — |
| typecheck:all | 0 | — |
| vsix | **138 files / 252.71 KB** — 0 test/features/qa/SPEC file inside | — |

## Findings

| # | Finding | Severity | Adjudication | Disposition |
|---|---|---|---|---|
| F-1 | `push(...steps)` spread of 1M args → `RangeError` — index never built (full-scale stress v1, pre-cycle) | **BLOQUANT** (crash) | fix + regression test | **CLOSED** — TDD: R7 unit (200k-step scenario, RED→GREEN) + e2e stress · `0f84261` `16307a5` `4d6ba4e` |
| F-2 | CRASH-001 — 1M undefined steps → 1M diagnostics flood | — | capacity check | **CLOSED** — no crash: 1M ERRORs published in ~2.6 s, RSS 773 MB, probe 0 locations, restart clean (registry trace) |
| F-3 | CRASH-002 — nested-quantifier regex `(\w+)+` → 76 s extension-host freeze (deterministic; 942 s isolated at 38 chars) | NON BLOQUANT v0.1.0 (S9 re-tranche) | documented limitation | README § limitations + registry; faithful fix = bounded matching = **v1 feature** |
| F-4 | CRASH-003 — unreadable `.feature` → the rejected rebuild silently loses the **entire** index (no diagnostic, no feedback) | **BLOQUANT** (Feedback & explicitness) | fix before publication | **CLOSED** — TDD: e2e RED→GREEN (chmod 000 + partial index + 6th diagnostic `Cannot read file`) · `944d89a` `35946ce` |
| F-5 | Star-slash `@Given /abc*/` (or unclosed docblock) → definition silently not indexed | NON BLOQUANT | documented limitation | README § limitations (the file is **invalid PHP** — Behat fatals on it; the skip is faithful, the silence is the defect → v1 diagnostic) |

## Steps

1. **New rules** — F-1 and F-4 are new behavior delivered with tests (R7 + e2e CRASH-003). The 6th diagnostic (unreadable file) is specified in SPEC §5/§7 + README.
2. **Past rules** — full non-regression green (counters above); the 21 pre-existing e2e tests pass unchanged around the new CRASH-003 scenario.
3. **Resilience (chat-noir)** — fresh-context agent, 0 crashes across all fields (malformed files, IO, pathological regex, empty workspace, kill mid-build, bad config). 1 registry case consumed (CRASH-001), 2 new cases registered (CRASH-002/003), 1 fixed + e2e-locked (F-4).
4. **Coherence** — `coherence-check` pass after the fix (verdict below).
5. **CI automation** — `.github/workflows/ci.yml` (S5): push/PR = unit + e2e + stress smoke 100×100 + vsix content; tag `v*` = stress full + pack. CRASH-003 moved from manual discovery to the `check` job (e2e). Remaining manual: chat-noir discovery, CRASH-001 at full scale (42 MB — reduced-scale candidate in `automation.md`), fresh clone (S8).

**KPI (manual time/cycle)**: crash-case discovery is codified — every new case gets an ID, a trace and (when fixable) an e2e lock; CRASH-003's manual re-run is now automated.

## Verdict

Green for S6/S7 — the only pre-publication BLOQUANT (F-4) is fixed and locked; F-3/F-5 are documented limitations with a v1 path. Expert gate (S9) to confirm the 2 × 100 % before publication.
