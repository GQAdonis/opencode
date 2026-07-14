use tauri::{Manager, Runtime, WebviewWindow, Window, plugin::Plugin};
use tauri_plugin_store::StoreExt;

use crate::constants::{PINCH_ZOOM_ENABLED_KEY, SETTINGS_STORE};

pub struct PinchZoomDisablePlugin;

impl Default for PinchZoomDisablePlugin {
    fn default() -> Self {
        Self
    }
}

/// Read the persisted pinch-zoom-enabled setting. Defaults to `false` (disabled),
/// matching the historical unconditional-disable behavior.
pub fn pinch_zoom_enabled<R: Runtime>(app: &tauri::AppHandle<R>) -> bool {
    app.store(SETTINGS_STORE)
        .ok()
        .and_then(|store| store.get(PINCH_ZOOM_ENABLED_KEY))
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

impl<R: Runtime> Plugin<R> for PinchZoomDisablePlugin {
    fn name(&self) -> &'static str {
        "pinch-zoom-disable"
    }

    fn window_created(&mut self, window: Window<R>) {
        let Some(webview_window) = window.get_webview_window(window.label()) else {
            return;
        };
        // Apply the persisted setting at creation. On Linux/Windows this is the
        // only point the gesture can be toggled (see apply_pinch_zoom); on macOS
        // it can also be changed live at runtime.
        let enabled = pinch_zoom_enabled(&window.app_handle());
        apply_pinch_zoom(&webview_window, enabled);
    }
}

/// Enable or disable native pinch/magnification zoom on a webview.
///
/// - macOS: fully reversible at runtime via `WKWebView.setAllowsMagnification`.
/// - Linux: when disabling, the GTK `GestureZoom` signal handler is destroyed.
///   This is NOT reversible without recreating the webview, so enabling at
///   runtime only takes effect after a relaunch (the setting is read at window
///   creation). Documented as a known partial-parity divergence.
/// - Windows: WebView2 has no separate pinch gesture to toggle here.
pub fn apply_pinch_zoom<R: Runtime>(webview_window: &WebviewWindow<R>, enabled: bool) {
    // with_webview dispatches the closure to the platform UI (main) thread via
    // the wry event loop, which is required for the AppKit/GTK calls below.
    let result = webview_window.with_webview(move |_webview| {
        #[cfg(target_os = "linux")]
        {
            // Only the disable direction is supported on Linux: the gesture is
            // destroyed, not merely suspended, so it can't be cheaply restored.
            if enabled {
                return;
            }
            use gtk::GestureZoom;
            use gtk::glib::ObjectExt;
            use webkit2gtk::glib::gobject_ffi;

            if let Some(data) = _webview.inner().data::<GestureZoom>("wk-view-zoom-gesture") {
                // SAFETY: `data` is a NonNull pointing into the live WebView
                // GObject's data dictionary (the WebView is kept alive by tauri
                // for the duration of this closure). `g_signal_handlers_destroy`
                // accepts a gpointer to a GObject; destroying an already-empty
                // handler list is a no-op, so a repeated disable is harmless.
                unsafe {
                    gobject_ffi::g_signal_handlers_destroy(data.as_ptr().cast());
                }
            }
        }

        #[cfg(target_os = "macos")]
        {
            use objc2::rc::Retained;
            use objc2_web_kit::WKWebView;

            // SAFETY: `_webview.inner()` is a non-null, aligned, initialized
            // `WKWebView *` that tauri keeps retained (+1) for the lifetime of
            // this closure, so the object is alive. `Retained::retain` adds a
            // balanced +1 that is released when `wk_webview` drops at the end of
            // the closure. `setAllowsMagnification` is a main-thread-only AppKit
            // method and this closure runs on the main thread (see above).
            unsafe {
                let wk_webview: Retained<WKWebView> = Retained::retain(_webview.inner().cast())
                    .expect("WKWebView must be alive inside with_webview closure");
                wk_webview.setAllowsMagnification(enabled);
            }
        }

        #[cfg(target_os = "windows")]
        {
            let _ = enabled;
        }
    });
    if let Err(e) = result {
        tracing::warn!("apply_pinch_zoom: with_webview dispatch failed: {e}");
    }
}
