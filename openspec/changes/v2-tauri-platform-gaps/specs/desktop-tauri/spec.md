# desktop-tauri

## ADDED Requirements

### Requirement: The Tauri host implements the debug-log export contract

The Tauri host SHALL expose `exportDebugLogs` on its `Platform` object so the shared app's
`logs.export` command and the crash screen's "Export logs" action are available.

#### Scenario: Debug log export is reachable from the app

- **GIVEN** the Tauri desktop app
- **WHEN** the shared app feature-detects `platform.exportDebugLogs`
- **THEN** the member SHALL be present
- **AND** invoking it SHALL return the path of the exported log archive

### Requirement: The Tauri host records fatal renderer errors natively

The Tauri host SHALL expose `recordFatalRendererError` so a fatal renderer error is persisted
to the native log sink rather than lost.

#### Scenario: A fatal renderer error is persisted

- **GIVEN** a fatal renderer error reported by the shared app
- **WHEN** `platform.recordFatalRendererError` is invoked with the error payload
- **THEN** the error SHALL be written to the native log sink

### Requirement: The Tauri host dispatches desktop menu actions

The Tauri host SHALL expose `runDesktopMenuAction` and handle every member of the
`DesktopMenuAction` union. Without it, the Windows/Linux application menu renders
action-typed entries that do nothing when clicked, while command-typed entries still work —
leaving the menu partially functional with no indication which entries are inert.

#### Scenario: Menu actions are handled on Windows and Linux

- **GIVEN** the Tauri desktop app on Windows or Linux
- **WHEN** the user selects an action-typed entry from the application menu
- **THEN** the corresponding action SHALL be performed
- **AND** no action in the `DesktopMenuAction` union SHALL be silently ignored

#### Scenario: Zoom actions are applied in the renderer

- **GIVEN** a zoom menu action (`view.zoomIn`, `view.zoomOut`, `view.resetZoom`)
- **WHEN** it is dispatched
- **THEN** the webview zoom level SHALL change
- **AND** the change SHALL be reflected in the zoom level the app reads back
