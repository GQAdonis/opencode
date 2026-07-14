//! Unresponsive-webview detection and crash dialog.
//!
//! Tauri/WRY has no native equivalent of Electron's `webContents` "unresponsive"
//! / "render-process-gone" events: the webview runs in-process, so liveness must
//! be observed cooperatively. The renderer posts a periodic `report_alive` ping;
//! a background task here flags the UI as stalled if no ping arrives within
//! `STALL_TIMEOUT` while the main window is focused, then shows a dialog offering
//! Relaunch / Export Logs / Quit — mirroring the Electron app's behavior.

use std::sync::{
    Arc,
    atomic::{AtomicU64, Ordering},
};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogResult};

use crate::windows::MainWindow;

/// No ping for this long (while focused) ⇒ treat the UI as unresponsive.
/// Generous to avoid false positives during heavy synchronous renderer work,
/// matching the spirit of Electron's 15s unresponsive sampling window.
const STALL_TIMEOUT: Duration = Duration::from_secs(15);
/// Polling cadence of the watchdog task.
const CHECK_INTERVAL: Duration = Duration::from_secs(2);

/// Shared liveness clock: milliseconds since the process-start `Instant` of the
/// last renderer ping. An `AtomicU64` keeps the hot path lock-free.
pub struct Heartbeat {
    origin: Instant,
    last_ping_ms: AtomicU64,
}

impl Heartbeat {
    fn new() -> Self {
        let origin = Instant::now();
        Self {
            origin,
            last_ping_ms: AtomicU64::new(0),
        }
    }

    fn touch(&self) {
        let elapsed = u64::try_from(self.origin.elapsed().as_millis()).unwrap_or(u64::MAX);
        self.last_ping_ms.store(elapsed, Ordering::Relaxed);
    }

    fn since_last_ping(&self) -> Duration {
        // Relaxed is sufficient: the watchdog only needs a recent-enough sample
        // for a 15s timeout, and no other state is published through this atomic,
        // so no happens-before relationship with other memory is required.
        let last = self.last_ping_ms.load(Ordering::Relaxed);
        let now = u64::try_from(self.origin.elapsed().as_millis()).unwrap_or(u64::MAX);
        Duration::from_millis(now.saturating_sub(last))
    }
}

/// Renderer heartbeat. Called on an interval from the webview; resets the stall clock.
#[tauri::command]
#[specta::specta]
pub fn report_alive(app: AppHandle) {
    if let Some(hb) = app.try_state::<Arc<Heartbeat>>() {
        hb.touch();
    }
}

/// Register heartbeat state and spawn the watchdog task. Call once from `setup`.
pub fn install(app: &AppHandle) {
    let heartbeat = Arc::new(Heartbeat::new());
    heartbeat.touch(); // start the clock so we don't fire before the first ping
    app.manage(heartbeat);

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        // Fires at most once per stall episode; reset when the UI recovers.
        let mut already_prompted = false;
        loop {
            tokio::time::sleep(CHECK_INTERVAL).await;

            let Some(hb) = app.try_state::<Arc<Heartbeat>>() else {
                continue;
            };

            let since_last_ping = hb.since_last_ping();

            // The renderer genuinely recovered only when a recent ping arrived.
            // Reset the debounce ONLY on real recovery — not on window blur —
            // so a blur/refocus can't spawn a second dialog over the first.
            if since_last_ping <= STALL_TIMEOUT {
                already_prompted = false;
                continue;
            }

            // Only treat a missed-ping as "unresponsive" while focused — a
            // backgrounded/occluded webview legitimately throttles timers.
            let focused = app
                .get_webview_window(MainWindow::LABEL)
                .and_then(|w| w.is_focused().ok())
                .unwrap_or(false);

            if !focused || already_prompted {
                continue;
            }
            already_prompted = true;

            tracing::warn!(
                since_ms = since_last_ping.as_millis() as u64,
                "Webview unresponsive — prompting user"
            );
            prompt_unresponsive(app.clone());
        }
    });
}

/// Show the unresponsive dialog and act on the choice (Relaunch / Export Logs /
/// Quit), mirroring the Electron app. Uses the async result callback so the
/// native modal is dispatched to the platform's UI thread by the plugin —
/// `blocking_show` on a Tokio blocking worker is unsafe on macOS (AppKit modals
/// must run on the main thread).
fn prompt_unresponsive(app: AppHandle) {
    let app_for_cb = app.clone();
    app.dialog()
        .message("opencode is not responding.")
        .title("Unresponsive")
        // Yes => Relaunch, No => Export Logs, Cancel => Quit
        .buttons(MessageDialogButtons::YesNoCancelCustom(
            "Relaunch".to_string(),
            "Export Logs".to_string(),
            "Quit".to_string(),
        ))
        .show_with_result(move |result| match result {
            MessageDialogResult::Yes => {
                crate::kill_sidecar_impl(&app_for_cb);
                app_for_cb.cleanup_before_exit();
                app_for_cb.restart();
            }
            MessageDialogResult::No => {
                // Export diagnostics, then re-prompt so the user can still
                // relaunch/quit.
                let _ = crate::logging::export_debug_logs(app_for_cb.clone());
                prompt_unresponsive(app_for_cb);
            }
            _ => {
                crate::kill_sidecar_impl(&app_for_cb);
                app_for_cb.exit(0);
            }
        });
}
