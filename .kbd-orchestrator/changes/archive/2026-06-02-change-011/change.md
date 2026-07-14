# change-011 — Add Ukrainian (uk) locale

- **Severity:** HIGH severity / trivial effort (gap G6)
- **Status:** [ ] not started
- **Agent:** typescript
- **Quick win:** can be pulled forward.
- **Files:** packages/desktop-tauri/src/i18n/uk.ts (new), src/i18n/index.ts

## Approach
Port packages/desktop/src/renderer/i18n/uk.ts desktop strings into desktop-tauri; register in i18n/index.ts (detection + merge), matching no/zht style.

## Tasks
- [ ] Create src/i18n/uk.ts (port desktop strings)
- [ ] Register uk in index.ts (detection + dictionary)

## Acceptance
- uk selectable + detected; strings render; locale count = 16.
