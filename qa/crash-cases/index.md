# Crash-cases — index

| ID | Case | Added | Last run | Outcome |
|----|------|-------|----------|---------|
| [CRASH-001](CRASH-001.md) | 1M undefined steps — diagnostics flood | 2026-11-09 | 2026-11-09 | no crash — 1M ERRORs published in ~2.6 s (both launches), probes 0 locations |
| [CRASH-002](CRASH-002.md) | Nested-quantifier regex — extension-host freeze | 2026-11-09 | 2026-11-09 | freeze reproduced — 76.2 s for a 41-char step line (host engine, deterministic); isolated Node 22: 942 s at 38 a's, measured 2×/char beyond n≈34 |
| [CRASH-003](CRASH-003.md) | Unreadable `.feature` file — silent total index loss | 2026-11-09 | 2026-11-09 | no crash — EACCES rejects the whole first rebuild: 0 diagnostics + dead navigation, rejection only in the host log; self-heals on next file event (measured) |
