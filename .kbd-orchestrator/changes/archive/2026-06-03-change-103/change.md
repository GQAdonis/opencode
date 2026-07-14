# change-103 — Manual GUI verification run-sheet

- **Severity:** MEDIUM (gap V4) · **Status:** [x] DONE 2026-06-03 (MANUAL-VERIFICATION.md authored + linked; execution = user manual pass) · **Agent:** docs
- **Files:** packages/desktop-tauri/MANUAL-VERIFICATION.md (new), link from PARITY-CHECKLIST.md + README

## Why
GUI-bound behaviors (watchdog dialog, theme flash, live pinch-zoom, menu, crash-on-panic) can only be confirmed by a human at a running app (Q2: manual checklist).

## Tasks
- [ ] Author MANUAL-VERIFICATION.md: per GUI item, repro steps + expected result, run via tauri dev
- [ ] Cover: unresponsive dialog (+ each button), crash file on panic, debug export folder/reveal, bg-color theme switch, pinch-zoom live toggle, macOS menu items
- [ ] Link from PARITY-CHECKLIST.md and README

## Acceptance
- Run-sheet exists, covers every GUI-bound checklist item with repro + expected, and is linked. (Execution = user's manual pass.)
