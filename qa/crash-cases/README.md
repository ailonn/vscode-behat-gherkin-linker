# Crash-cases registry

Black-box resilience cases for the extension — the `quality-checker` pipe, step 3
(résilience / chat noir). The chat-noir agent runs the cases with a fresh
context, tries to break the extension, and reports facts only (case found /
not found, reproducible trace, post-restart state). It never fixes: **a crash
found here is BLOQUANT** until the implementer fixes it and the crash becomes
a CI regression test (step 5 absorbs it).

## Conventions

- One file per case: `CRASH-<n>.md` — **ID + trigger + trace + expected
  behavior**. `index.md` is the table of contents (ID · case · added ·
  last run · outcome).
- Cases are **added, never deleted** — a case that no longer applies keeps
  its file with status `retired` (the registry is history).
- A case is *consumed* when its full trigger sequence was executed and the
  post-restart state was verified. The registry must be consumed **every**
  QA cycle (the `expert-QA` gate checks it is consumed, not just grown).
- Generated fixtures are produced on the fly by the trigger (gitignored or
  in `/tmp` — never committed).
- Trace: input minimal + command + stack (when there is a crash) +
  post-restart state. "Not found" cases keep the record of what was attempted
  (timeboxed — one resistant case is reported "not reproducible", not hunted).
