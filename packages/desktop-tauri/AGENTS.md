# Desktop package notes (Tauri)

- This is the Tauri desktop app the upstream abandoned (PR #25822); this fork keeps it. See root `AGENTS.md` → "Fork Divergences". Upstream's Electron app lives separately at `packages/desktop`.
- Never call `invoke` manually in this package.
- Use the generated bindings in `packages/desktop-tauri/src/bindings.ts` for core commands/events.
