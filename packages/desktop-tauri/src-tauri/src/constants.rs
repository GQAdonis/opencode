use std::time::Duration;
use tauri_plugin_window_state::StateFlags;

/// Kill a sidecar that never becomes healthy within this window (parity with the
/// Electron app's 60s start-stall timeout).
pub const SIDECAR_START_STALL_TIMEOUT: Duration = Duration::from_secs(60);

pub const SETTINGS_STORE: &str = "opencode.settings.dat";
pub const DEFAULT_SERVER_URL_KEY: &str = "defaultServerUrl";
pub const WSL_ENABLED_KEY: &str = "wslEnabled";
pub const PINCH_ZOOM_ENABLED_KEY: &str = "pinchZoomEnabled";
pub const FIRST_LAUNCH_ONBOARDING_COMPLETE_KEY: &str = "firstLaunchOnboardingComplete";
pub const UPDATER_ENABLED: bool = option_env!("TAURI_SIGNING_PRIVATE_KEY").is_some();

pub fn window_state_flags() -> StateFlags {
    StateFlags::all() - StateFlags::DECORATIONS - StateFlags::VISIBLE
}
