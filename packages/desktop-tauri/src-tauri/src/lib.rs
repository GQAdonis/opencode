mod cli;
mod constants;
mod crash;
#[cfg(target_os = "linux")]
pub mod linux_display;
#[cfg(target_os = "linux")]
pub mod linux_windowing;
mod logging;
mod markdown;
mod os;
mod server;
mod watchdog;
mod window_customizer;
mod windows;

use crate::cli::CommandChild;
use futures::{FutureExt, TryFutureExt};
use std::{
    env,
    future::Future,
    net::TcpListener,
    path::PathBuf,
    process::Command,
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{AppHandle, Listener, Manager, RunEvent, State, ipc::Channel};
#[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_specta::Event;
use tokio::{
    sync::{oneshot, watch},
    time::{sleep, timeout},
};

use crate::cli::{sqlite_migration::SqliteMigrationProgress, sync_cli};
use crate::constants::*;
use crate::windows::{LoadingWindow, MainWindow};

#[derive(Clone, serde::Serialize, specta::Type, Debug)]
struct ServerReadyData {
    url: String,
    username: Option<String>,
    password: Option<String>,
}

#[derive(Clone, Copy, serde::Serialize, specta::Type, Debug)]
#[serde(tag = "phase", rename_all = "snake_case")]
enum InitStep {
    ServerWaiting,
    SqliteWaiting,
    Done,
}

#[derive(serde::Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
enum WslPathMode {
    Windows,
    Linux,
}

struct InitState {
    current: watch::Receiver<InitStep>,
}

struct ServerState {
    child: Arc<Mutex<Option<CommandChild>>>,
}

/// Resolves with sidecar credentials as soon as the sidecar is spawned (before health check).
struct SidecarReady(futures::future::Shared<oneshot::Receiver<ServerReadyData>>);

#[tauri::command]
#[specta::specta]
fn kill_sidecar(app: AppHandle) {
    kill_sidecar_impl(&app);
}

/// Non-command kill path so other modules (e.g. the watchdog) can stop the
/// sidecar without depending on the `#[tauri::command]`-generated symbols.
pub(crate) fn kill_sidecar_impl(app: &AppHandle) {
    let Some(server_state) = app.try_state::<ServerState>() else {
        tracing::info!("Server not running");
        return;
    };

    // Recover from a poisoned lock rather than panicking: this path runs during
    // crash/unresponsive recovery, where another thread may have panicked while
    // holding the lock.
    let mut guard = server_state
        .child
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let Some(server_state) = guard.take() else {
        tracing::info!("Server state missing");
        return;
    };

    let _ = server_state.kill();

    tracing::info!("Killed server");
}

#[tauri::command]
#[specta::specta]
async fn await_initialization(
    state: State<'_, SidecarReady>,
    init_state: State<'_, InitState>,
    events: Channel<InitStep>,
) -> Result<ServerReadyData, String> {
    let mut rx = init_state.current.clone();

    let stream = async {
        let e = *rx.borrow();
        let _ = events.send(e);

        while rx.changed().await.is_ok() {
            let step = *rx.borrow_and_update();
            let _ = events.send(step);

            if matches!(step, InitStep::Done) {
                break;
            }
        }
    };

    // Wait for sidecar credentials (available immediately after spawn, before health check)
    let data = async {
        state
            .inner()
            .0
            .clone()
            .await
            .map_err(|_| "Failed to get sidecar data".to_string())
    };

    let (result, _) = futures::future::join(data, stream).await;
    result
}

#[tauri::command]
#[specta::specta]
fn get_pinch_zoom_enabled(app: AppHandle) -> bool {
    window_customizer::pinch_zoom_enabled(&app)
}

const DEFAULT_PROJECT_DIR: &str = "New OpenCode Project";

/// True until the first-launch onboarding has been completed (parity with the
/// Electron app's isFirstLaunchOnboardingPending).
#[tauri::command]
#[specta::specta]
fn is_first_launch_onboarding_pending(app: AppHandle) -> Result<bool, String> {
    use tauri_plugin_store::StoreExt;
    let store = app
        .store(constants::SETTINGS_STORE)
        .map_err(|e| format!("Failed to open settings store: {e}"))?;
    let pending = store.get(constants::FIRST_LAUNCH_ONBOARDING_COMPLETE_KEY) != Some(serde_json::Value::Bool(true));
    Ok(pending)
}

/// Mark first-launch onboarding complete. When `create_default_project` is true
/// and onboarding is still pending, create a default project directory under the
/// user's Documents folder and return its path. Returns null if onboarding was
/// already completed or no project was created (parity with the Electron app's
/// finishFirstLaunchOnboarding).
#[tauri::command]
#[specta::specta]
fn finish_first_launch_onboarding(
    app: AppHandle,
    create_default_project: bool,
) -> Result<Option<String>, String> {
    use tauri_plugin_store::StoreExt;
    if !is_first_launch_onboarding_pending(app.clone())? {
        return Ok(None);
    }

    let default_project = if create_default_project {
        let documents = app
            .path()
            .document_dir()
            .map_err(|e| format!("Failed to resolve documents dir: {e}"))?;
        let dir = documents.join(DEFAULT_PROJECT_DIR);
        std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create default project: {e}"))?;
        Some(dir.to_string_lossy().into_owned())
    } else {
        None
    };

    let store = app
        .store(constants::SETTINGS_STORE)
        .map_err(|e| format!("Failed to open settings store: {e}"))?;
    store.set(
        constants::FIRST_LAUNCH_ONBOARDING_COMPLETE_KEY,
        serde_json::Value::Bool(true),
    );
    store
        .save()
        .map_err(|e| format!("Failed to save settings: {e}"))?;

    Ok(default_project)
}

/// Persist the pinch-zoom setting and apply it live where supported (macOS).
/// On Linux/Windows the change takes effect on next launch (see window_customizer).
#[tauri::command]
#[specta::specta]
fn set_pinch_zoom_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;
    let store = app
        .store(constants::SETTINGS_STORE)
        .map_err(|e| format!("Failed to open settings store: {e}"))?;
    store.set(
        constants::PINCH_ZOOM_ENABLED_KEY,
        serde_json::Value::Bool(enabled),
    );
    store
        .save()
        .map_err(|e| format!("Failed to save settings: {e}"))?;

    for (_, window) in app.webview_windows() {
        window_customizer::apply_pinch_zoom(&window, enabled);
    }
    Ok(())
}

/// Set the native window background color on all windows so it matches the web
/// UI theme, preventing a flash/mismatch on launch, resize, and theme switch
/// (mirrors the Electron app's setBackgroundColor). Accepts `#rgb`, `#rrggbb`,
/// or `#rrggbbaa`.
#[tauri::command]
#[specta::specta]
fn set_background_color(app: AppHandle, color: String) -> Result<(), String> {
    let parsed = parse_hex_color(&color).ok_or_else(|| format!("invalid color: {color}"))?;
    for (_, window) in app.webview_windows() {
        let _ = window.set_background_color(Some(parsed));
        // macOS renders the window shadow from the (now-stale) old backing;
        // force AppKit to recompute it so the drop shadow tracks the new theme
        // color. Mirrors the Electron app's win.invalidateShadow() call.
        #[cfg(target_os = "macos")]
        invalidate_window_shadow(&window);
    }
    Ok(())
}

/// Invalidate the NSWindow shadow so macOS recomputes the drop shadow after a
/// background-color or appearance change (parity with Electron's
/// `win.invalidateShadow()`).
#[cfg(target_os = "macos")]
fn invalidate_window_shadow<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    use objc2::msg_send;
    use objc2::runtime::AnyObject;

    let Ok(ns_window) = window.ns_window() else {
        return;
    };
    if ns_window.is_null() {
        return;
    }
    // SAFETY: `ns_window()` returns the live `NSWindow *` owned by tauri for the
    // window's lifetime; `-invalidateShadow` is a main-thread AppKit method and
    // Tauri command handlers run on the main thread. The pointer is non-null
    // (checked above) and takes no arguments / returns void.
    unsafe {
        let ns_window = ns_window as *mut AnyObject;
        let _: () = msg_send![ns_window, invalidateShadow];
    }
}

/// Align the native window appearance with the web UI theme. On macOS the
/// NSWindow frame hairline and drop shadow follow the window's appearance
/// (which tracks the OS, not the rendered content), so a light app on a dark
/// system would otherwise get a dark-appearance border and shadow. `scheme`
/// ("system" | "light" | "dark") wins over `mode` ("light" | "dark") and a
/// `"system"` scheme maps to "follow OS" (`None`) so prefers-color-scheme keeps
/// tracking OS appearance changes. Mirrors the Electron app's
/// `nativeTheme.themeSource = scheme ?? mode ?? "system"` in setTitlebar.
#[tauri::command]
#[specta::specta]
fn set_titlebar(app: AppHandle, mode: String, scheme: Option<String>) -> Result<(), String> {
    let resolved = scheme.unwrap_or(mode);
    let theme = match resolved.as_str() {
        "light" => Some(tauri::Theme::Light),
        "dark" => Some(tauri::Theme::Dark),
        // "system" (or anything unexpected) → follow the OS appearance.
        _ => None,
    };
    for (_, window) in app.webview_windows() {
        let _ = window.set_theme(theme);
        // The appearance change also affects the frame hairline/shadow on macOS.
        #[cfg(target_os = "macos")]
        invalidate_window_shadow(&window);
    }
    Ok(())
}

fn parse_hex_color(input: &str) -> Option<tauri::window::Color> {
    let hex = input.strip_prefix('#')?;
    let bytes = match hex.len() {
        // #rgb → expand each nibble
        3 => hex
            .chars()
            .map(|c| u8::from_str_radix(&c.to_string(), 16).map(|v| v * 17))
            .collect::<Result<Vec<_>, _>>()
            .ok()
            .map(|v| [v[0], v[1], v[2], 255])?,
        6 => {
            let v = u32::from_str_radix(hex, 16).ok()?;
            [(v >> 16) as u8, (v >> 8) as u8, v as u8, 255]
        }
        8 => {
            let v = u32::from_str_radix(hex, 16).ok()?;
            [(v >> 24) as u8, (v >> 16) as u8, (v >> 8) as u8, v as u8]
        }
        _ => return None,
    };
    Some(tauri::window::Color(bytes[0], bytes[1], bytes[2], bytes[3]))
}

#[tauri::command]
#[specta::specta]
fn check_app_exists(app_name: &str) -> bool {
    #[cfg(target_os = "windows")]
    {
        os::windows::check_windows_app(app_name)
    }

    #[cfg(target_os = "macos")]
    {
        check_macos_app(app_name)
    }

    #[cfg(target_os = "linux")]
    {
        check_linux_app(app_name)
    }
}

#[tauri::command]
#[specta::specta]
fn resolve_app_path(app_name: &str) -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        os::windows::resolve_windows_app_path(app_name)
    }

    #[cfg(not(target_os = "windows"))]
    {
        // On macOS/Linux, just return the app_name as-is since
        // the opener plugin handles them correctly
        Some(app_name.to_string())
    }
}

#[tauri::command]
#[specta::specta]
fn open_path(_app: AppHandle, path: String, app_name: Option<String>) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let app_name = app_name.map(|v| os::windows::resolve_windows_app_path(&v).unwrap_or(v));
        let is_powershell = app_name.as_ref().is_some_and(|v| {
            std::path::Path::new(v)
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| {
                    name.eq_ignore_ascii_case("powershell")
                        || name.eq_ignore_ascii_case("powershell.exe")
                })
        });

        if is_powershell {
            return os::windows::open_in_powershell(path);
        }

        return tauri_plugin_opener::open_path(path, app_name.as_deref())
            .map_err(|e| format!("Failed to open path: {e}"));
    }

    #[cfg(not(target_os = "windows"))]
    tauri_plugin_opener::open_path(path, app_name.as_deref())
        .map_err(|e| format!("Failed to open path: {e}"))
}

#[cfg(target_os = "macos")]
fn check_macos_app(app_name: &str) -> bool {
    // Check common installation locations
    let mut app_locations = vec![
        format!("/Applications/{}.app", app_name),
        format!("/System/Applications/{}.app", app_name),
    ];

    if let Ok(home) = std::env::var("HOME") {
        app_locations.push(format!("{}/Applications/{}.app", home, app_name));
    }

    for location in app_locations {
        if std::path::Path::new(&location).exists() {
            return true;
        }
    }

    // Also check if command exists in PATH
    Command::new("which")
        .arg(app_name)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

#[derive(serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum LinuxDisplayBackend {
    Wayland,
    Auto,
}

#[tauri::command]
#[specta::specta]
fn get_display_backend() -> Option<LinuxDisplayBackend> {
    #[cfg(target_os = "linux")]
    {
        let prefer = linux_display::read_wayland().unwrap_or(false);
        return Some(if prefer {
            LinuxDisplayBackend::Wayland
        } else {
            LinuxDisplayBackend::Auto
        });
    }

    #[cfg(not(target_os = "linux"))]
    None
}

#[tauri::command]
#[specta::specta]
fn set_display_backend(_app: AppHandle, _backend: LinuxDisplayBackend) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let prefer = matches!(_backend, LinuxDisplayBackend::Wayland);
        return linux_display::write_wayland(&_app, prefer);
    }

    #[cfg(not(target_os = "linux"))]
    Ok(())
}

#[cfg(target_os = "linux")]
fn check_linux_app(app_name: &str) -> bool {
    return true;
}

#[tauri::command]
#[specta::specta]
fn wsl_path(path: String, mode: Option<WslPathMode>) -> Result<String, String> {
    if !cfg!(windows) {
        return Ok(path);
    }

    let flag = match mode.unwrap_or(WslPathMode::Linux) {
        WslPathMode::Windows => "-w",
        WslPathMode::Linux => "-u",
    };

    let output = if path.starts_with('~') {
        let suffix = path.strip_prefix('~').unwrap_or("");
        let escaped = suffix.replace('"', "\\\"");
        let cmd = format!("wslpath {flag} \"$HOME{escaped}\"");
        Command::new("wsl")
            .args(["-e", "sh", "-lc", &cmd])
            .output()
            .map_err(|e| format!("Failed to run wslpath: {e}"))?
    } else {
        Command::new("wsl")
            .args(["-e", "wslpath", flag, &path])
            .output()
            .map_err(|e| format!("Failed to run wslpath: {e}"))?
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.is_empty() {
            return Err("wslpath failed".to_string());
        }
        return Err(stderr);
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Returns a stable identity for the current window, used by the renderer to
/// scope per-window persisted stores (tabs, recent tabs). Mirrors Electron's
/// `get-window-id` IPC. In Tauri there is a single managed webview, so the
/// window label serves as the stable ID.
#[tauri::command]
#[specta::specta]
fn get_window_id(window: tauri::Window) -> String {
    window.label().to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = make_specta_builder();

    #[cfg(debug_assertions)] // <- Only export on non-release builds
    export_types(&builder);

    #[cfg(all(target_os = "macos", not(debug_assertions)))]
    let _ = std::process::Command::new("killall")
        .arg("opencode-cli")
        .output();

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Focus existing window when another instance is launched
            if let Some(window) = app.get_webview_window(MainWindow::LABEL) {
                let _ = window.set_focus();
                let _ = window.unminimize();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_os::init())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(window_state_flags())
                .with_denylist(&[LoadingWindow::LABEL])
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(crate::window_customizer::PinchZoomDisablePlugin)
        .plugin(tauri_plugin_decorum::init())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            let handle = app.handle().clone();

            let log_dir = app
                .path()
                .app_log_dir()
                .expect("failed to resolve app log dir");
            // Hold the guard in managed state so it lives for the app's lifetime,
            // ensuring all buffered logs are flushed on shutdown.
            handle.manage(logging::init(&log_dir));

            // Local-only crash reporting (panic hook → crashes/ subdir). Install
            // after logging so reports can be logged, before any panicking work.
            crash::install(&log_dir);

            builder.mount_events(&handle);
            watchdog::install(&handle);
            tauri::async_runtime::spawn(initialize(handle));

            Ok(())
        });

    if UPDATER_ENABLED {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                tracing::info!("Received Exit");

                kill_sidecar(app.clone());
            }
        });
}

fn make_specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        // Then register them (separated by a comma)
        .commands(tauri_specta::collect_commands![
            kill_sidecar,
            cli::install_cli,
            await_initialization,
            server::get_default_server_url,
            server::set_default_server_url,
            server::get_wsl_config,
            server::set_wsl_config,
            get_display_backend,
            set_display_backend,
            markdown::parse_markdown_command,
            check_app_exists,
            wsl_path,
            resolve_app_path,
            open_path,
            set_background_color,
            set_titlebar,
            get_pinch_zoom_enabled,
            set_pinch_zoom_enabled,
            is_first_launch_onboarding_pending,
            finish_first_launch_onboarding,
            get_window_id,
            watchdog::report_alive,
            logging::export_debug_logs,
            crash::record_fatal_renderer_error
        ])
        .events(tauri_specta::collect_events![
            LoadingWindowComplete,
            SqliteMigrationProgress
        ])
        .error_handling(tauri_specta::ErrorHandlingMode::Throw)
}

fn export_types(builder: &tauri_specta::Builder<tauri::Wry>) {
    builder
        .export(
            specta_typescript::Typescript::default(),
            "../src/bindings.ts",
        )
        .expect("Failed to export typescript bindings");
}

#[cfg(test)]
#[test]
fn test_export_types() {
    let builder = make_specta_builder();
    export_types(&builder);
}

#[derive(tauri_specta::Event, serde::Deserialize, specta::Type)]
struct LoadingWindowComplete;

async fn initialize(app: AppHandle) {
    tracing::info!("Initializing app");

    let (init_tx, init_rx) = watch::channel(InitStep::ServerWaiting);

    setup_app(&app, init_rx);
    spawn_cli_sync_task(app.clone());

    // Spawn sidecar immediately - credentials are known before health check
    let port = get_sidecar_port();
    let hostname = "127.0.0.1";
    let url = format!("http://{hostname}:{port}");
    let password = uuid::Uuid::new_v4().to_string();

    tracing::info!("Spawning sidecar on {url}");
    let (child, health_check) =
        server::spawn_local_server(app.clone(), hostname.to_string(), port, password.clone());

    // Make sidecar credentials available immediately (before health check completes)
    let (ready_tx, ready_rx) = oneshot::channel();
    let _ = ready_tx.send(ServerReadyData {
        url: url.clone(),
        username: Some("opencode".to_string()),
        password: Some(password),
    });
    app.manage(SidecarReady(ready_rx.shared()));
    app.manage(ServerState {
        child: Arc::new(Mutex::new(Some(child))),
    });

    let loading_window_complete = event_once_fut::<LoadingWindowComplete>(&app);

    // SQLite migration handling:
    // We only do this if the sqlite db doesn't exist, and we're expecting the sidecar to create it.
    // A separate loading window is shown for long migrations.
    let needs_migration = !sqlite_file_exists();
    let sqlite_done = needs_migration.then(|| {
        tracing::info!(
            path = %opencode_db_path().expect("failed to get db path").display(),
            "Sqlite file not found, waiting for it to be generated"
        );

        let (done_tx, done_rx) = oneshot::channel::<()>();
        let done_tx = Arc::new(Mutex::new(Some(done_tx)));

        let init_tx = init_tx.clone();
        let id = SqliteMigrationProgress::listen(&app, move |e| {
            let _ = init_tx.send(InitStep::SqliteWaiting);

            if matches!(e.payload, SqliteMigrationProgress::Done)
                && let Some(done_tx) = done_tx.lock().unwrap().take()
            {
                let _ = done_tx.send(());
            }
        });

        let app = app.clone();
        tokio::spawn(done_rx.map(async move |_| {
            app.unlisten(id);
        }))
    });

    // The loading task waits for SQLite migration (if needed) then for the sidecar health check.
    // This is only used to drive the loading window progress - the main window is shown immediately.
    let loading_task = tokio::spawn({
        async move {
            if let Some(sqlite_done_rx) = sqlite_done {
                let _ = sqlite_done_rx.await;
            }

            // Wait for sidecar to become healthy (for loading window progress)
            let res = timeout(Duration::from_secs(30), health_check.0).await;
            match res {
                Ok(Ok(Ok(()))) => tracing::info!("Sidecar health check OK"),
                Ok(Ok(Err(e))) => tracing::error!("Sidecar health check failed: {e}"),
                Ok(Err(e)) => tracing::error!("Sidecar health check task failed: {e}"),
                Err(_) => tracing::error!("Sidecar health check timed out"),
            }

            tracing::info!("Loading task finished");
        }
    })
    .map_err(|_| ())
    .shared();

    // Show loading window for SQLite migrations if they take >1s
    let loading_window = if needs_migration
        && timeout(Duration::from_secs(1), loading_task.clone())
            .await
            .is_err()
    {
        tracing::debug!("Loading task timed out, showing loading window");
        let loading_window = LoadingWindow::create(&app).expect("Failed to create loading window");
        sleep(Duration::from_secs(1)).await;
        Some(loading_window)
    } else {
        None
    };

    // Create main window immediately - the web app handles its own loading/health gate
    MainWindow::create(&app).expect("Failed to create main window");

    let _ = loading_task.await;

    tracing::info!("Loading done, completing initialisation");
    let _ = init_tx.send(InitStep::Done);

    if loading_window.is_some() {
        loading_window_complete.await;
        tracing::info!("Loading window completed");
    }

    if let Some(loading_window) = loading_window {
        let _ = loading_window.close();
    }
}

fn setup_app(app: &tauri::AppHandle, init_rx: watch::Receiver<InitStep>) {
    #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
    app.deep_link().register_all().ok();

    app.manage(InitState { current: init_rx });
}

fn spawn_cli_sync_task(app: AppHandle) {
    tokio::spawn(async move {
        if let Err(e) = sync_cli(app) {
            tracing::error!("Failed to sync CLI: {e}");
        }
    });
}


fn get_sidecar_port() -> u32 {
    option_env!("OPENCODE_PORT")
        .map(|s| s.to_string())
        .or_else(|| std::env::var("OPENCODE_PORT").ok())
        .and_then(|port_str| port_str.parse().ok())
        .unwrap_or_else(|| {
            TcpListener::bind("127.0.0.1:0")
                .expect("Failed to bind to find free port")
                .local_addr()
                .expect("Failed to get local address")
                .port()
        }) as u32
}

fn sqlite_file_exists() -> bool {
    let Ok(path) = opencode_db_path() else {
        return true;
    };

    path.exists()
}

fn opencode_db_path() -> Result<PathBuf, &'static str> {
    let xdg_data_home = env::var_os("XDG_DATA_HOME").filter(|v| !v.is_empty());

    let data_home = match xdg_data_home {
        Some(v) => PathBuf::from(v),
        None => {
            let home = dirs::home_dir().ok_or("cannot determine home directory")?;
            home.join(".local").join("share")
        }
    };

    Ok(data_home.join("opencode").join("opencode.db"))
}

// Creates a `once` listener for the specified event and returns a future that resolves
// when the listener is fired.
// Since the future creation and awaiting can be done separately, it's possible to create the listener
// synchronously before doing something, then awaiting afterwards.
fn event_once_fut<T: tauri_specta::Event + serde::de::DeserializeOwned>(
    app: &AppHandle,
) -> impl Future<Output = ()> {
    let (tx, rx) = oneshot::channel();
    T::once(app, |_| {
        let _ = tx.send(());
    });
    async {
        let _ = rx.await;
    }
}
