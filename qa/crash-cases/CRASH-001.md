# CRASH-001 — 1M undefined steps (diagnostics flood)

- **Status**: not run yet (added 2026-11-09, wave 3)
- **Source**: `test/stress/stress-spec.md` §3 `diagnostics-flood` — the 1M
  undefined-steps case is a chat-noir crash case, **not** part of the stress
  (the stress asserts the fully-matched workspace; this case inverts it: the
  same 1M steps, zero definitions).

## Trigger

1. Generate the full-scale stress fixture:
   `node test/stress/generate-stress.mjs --scenarios 1000 --steps 1000 --seed 42 --out /tmp/crash-001`
2. Remove the PHP context so every step is undefined:
   `rm /tmp/crash-001/StressContext.php`
3. Launch the extension on that workspace (test-electron, as `pnpm test:stress`
   does — a suite that waits for the index build, then probes) and let the
   index build.
4. Kill it and start a **fresh instance** on the same workspace (post-restart
   check).

Workspace shape: `stress.feature` = 1000 scenarios × 1000 steps (~42 MB,
1M steps), no `.php` file → all 1M steps undefined, 0 definitions.

## Expected behavior (documented — the run verifies it)

- **No crash**: the extension host survives parse → index → publication of
  1M `vscode.Diagnostic` objects (ERROR severity, one per step line —
  `publishDiagnostics` builds them in one array and `collection.set`s per
  file) and stays responsive afterwards.
- **Navigation degrades, does not break**: a definition probe on any step
  line resolves to **0 locations** (the step is undefined — the provider must
  return empty, not throw).
- **Restart**: the fresh instance rebuilds the index and re-publishes the
  same 1M diagnostics (state reconstructed, no corrupt residue).
- **Documented slowness**: building and publishing 1M diagnostics is a heavy
  operation (memory + wall time). The measured wall time is reported in the
  trace. **Slow-but-alive passes**; a freeze (no progress for > 10 min) or a
  crash fails the case.

## Trace

(to be filled by the chat-noir run: minimal input + command + stack when a
crash occurs + post-restart state + measured wall time)
