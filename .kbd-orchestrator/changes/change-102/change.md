# change-102 — Headless behavior tests (extract pure cores)

- **Severity:** HIGH (gap V2) · **Status:** [x] DONE 2026-06-03 (4 new tests pass; extracted format_crash_report + copy_dir_filtered_capped) · **Agent:** rust
- **Files:** src-tauri/src/logging.rs, src-tauri/src/crash.rs (+ maybe constants.rs)

## Why
crash reporting / debug export / start-stall have no automated coverage; command wrappers need AppHandle (not unit-testable) but their I/O cores are pure.

## Tasks
- [ ] Tests for copy_dir_filtered: skips >50MB, skips symlinks, recurses subdirs
- [ ] Extract + test format_crash_report (handles &str/String payload, includes version/os/arch/location)
- [ ] (opt) extract gather_manifest pure builder + test JSON shape
- [ ] Assert SIDECAR_START_STALL_TIMEOUT; document start-stall as manual if timing-bound
- [ ] No behavior change to commands; cargo check + existing tests still green

## Acceptance
- cargo test (src-tauri) passes with new export-filter + crash-format tests.
