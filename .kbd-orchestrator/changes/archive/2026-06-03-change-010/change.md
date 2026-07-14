# change-010 — Network logging + Sentry desktop tags

- **Severity:** MEDIUM (gap G7 netlog / #36)
- **Status:** [x] DONE 2026-06-03 (typecheck pass; Sentry desktop init added — Tauri had none; netlog deliberately not ported)
- **Agent:** rust + typescript
- **Note:** Sentry.init already runs via shared packages/app/entry.tsx — DO NOT duplicate. Only verify/add desktop tags.
- **Files:** src-tauri/src/logging.rs, src/index.tsx

## Tasks
- [ ] (opt) lightweight request logging on Rust health/HTTP path
- [ ] Verify shared Sentry.init gets desktop release/tags under Tauri; add if absent (no dup init)

## Acceptance
- Tauri Sentry events carry desktop platform/release tags; basic net diagnostics available.
