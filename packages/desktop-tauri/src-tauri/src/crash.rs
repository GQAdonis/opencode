//! Local-only crash reporting.
//!
//! Installs a panic hook that writes a timestamped crash report (panic message,
//! location, backtrace, app/platform metadata) into a `crashes/` subdirectory of
//! the app log dir. Nothing is transmitted off-device — this mirrors the Electron
//! app's local Crashpad dumps (`uploadToServer: false`). The reports are picked up
//! by the debug-log export (see `logging`/export command).

use std::backtrace::Backtrace;
use std::fs;
use std::panic;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

const CRASH_SUBDIR: &str = "crashes";
const MAX_CRASH_AGE_DAYS: u64 = 14;

static CRASH_DIR: OnceLock<PathBuf> = OnceLock::new();

/// Returns the directory crash reports are written to, if crash reporting was installed.
/// Consumed by the debug-log export command.
pub fn crash_dir() -> Option<&'static Path> {
    CRASH_DIR.get().map(PathBuf::as_path)
}

/// Install the panic hook. Call once, early, from `setup`. `log_dir` is the
/// app log directory; crash reports go in `<log_dir>/crashes/`.
pub fn install(log_dir: &Path) {
    let dir = log_dir.join(CRASH_SUBDIR);
    if let Err(e) = fs::create_dir_all(&dir) {
        tracing::warn!("failed to create crash dir: {e}");
        return;
    }
    cleanup(&dir);

    if CRASH_DIR.set(dir).is_err() {
        // Already installed.
        return;
    }

    // Chain the previous hook so default backtrace printing still happens.
    let previous = panic::take_hook();
    panic::set_hook(Box::new(move |info| {
        if let Err(e) = write_report(info) {
            tracing::error!("failed to write crash report: {e}");
        }
        previous(info);
    }));
}

fn write_report(info: &panic::PanicHookInfo<'_>) -> std::io::Result<()> {
    let Some(dir) = CRASH_DIR.get() else {
        return Ok(());
    };

    let timestamp = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S%.3f");
    let path = dir.join(format!("crash_{timestamp}.txt"));

    let message = info
        .payload()
        .downcast_ref::<&str>()
        .map(|s| s.to_string())
        .or_else(|| info.payload().downcast_ref::<String>().cloned())
        .unwrap_or_else(|| "<non-string panic payload>".to_string());

    let location = info
        .location()
        .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
        .unwrap_or_else(|| "<unknown>".to_string());

    // force-capture so we get frames even without RUST_BACKTRACE set.
    let backtrace = Backtrace::force_capture();

    let report = format_crash_report(&timestamp.to_string(), &location, &message, &backtrace.to_string());
    fs::write(&path, report)?;

    tracing::error!(crash_report = %path.display(), "wrote crash report");
    Ok(())
}

/// Build the crash report body. Pure (no I/O / globals) so it is unit-testable.
fn format_crash_report(timestamp: &str, location: &str, message: &str, backtrace: &str) -> String {
    let version = option_env!("CARGO_PKG_VERSION").unwrap_or("unknown");
    format!(
        "opencode desktop crash report\n\
         time:     {timestamp}\n\
         version:  {version}\n\
         os:       {os}\n\
         arch:     {arch}\n\
         location: {location}\n\
         message:  {message}\n\
         \nbacktrace:\n{backtrace}\n",
        os = std::env::consts::OS,
        arch = std::env::consts::ARCH,
    )
}

/// Mirrors `FatalRendererErrorLog` in `packages/app/src/context/platform.tsx`.
#[derive(serde::Deserialize, specta::Type, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FatalRendererError {
    pub error: String,
    pub url: String,
    pub version: Option<String>,
    pub platform: String,
    pub os: Option<String>,
}

/// Persist a fatal *renderer* error the same way a native panic is persisted.
///
/// Without this the shared app's fatal-error path (`pages/error.tsx`) has nowhere to write on
/// Tauri, so the error that killed the UI is the one error never captured. Reports land in the
/// same `crashes/` dir as panics, which means the existing debug-log export picks them up with
/// no extra wiring.
#[tauri::command]
#[specta::specta]
pub fn record_fatal_renderer_error(payload: FatalRendererError) -> Result<(), String> {
    let Some(dir) = CRASH_DIR.get() else {
        // Crash reporting was never installed; log it and move on rather than fail the caller,
        // which is already handling a fatal error.
        tracing::error!(error = %payload.error, url = %payload.url, "fatal renderer error (no crash dir)");
        return Ok(());
    };

    let timestamp = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S%.3f");
    let path = dir.join(format!("renderer_{timestamp}.txt"));

    let report = format_renderer_report(&timestamp.to_string(), &payload);
    fs::write(&path, report).map_err(|e| e.to_string())?;

    tracing::error!(crash_report = %path.display(), "wrote fatal renderer error report");
    Ok(())
}

/// Build the renderer report body. Pure (no I/O / globals) so it is unit-testable.
fn format_renderer_report(timestamp: &str, payload: &FatalRendererError) -> String {
    let version = payload.version.as_deref().unwrap_or("unknown");
    let os = payload.os.as_deref().unwrap_or(std::env::consts::OS);
    format!(
        "opencode desktop fatal renderer error\n\
         time:     {timestamp}\n\
         version:  {version}\n\
         os:       {os}\n\
         arch:     {arch}\n\
         platform: {platform}\n\
         url:      {url}\n\
         \nerror:\n{error}\n",
        arch = std::env::consts::ARCH,
        platform = payload.platform,
        url = payload.url,
        error = payload.error,
    )
}

fn cleanup(dir: &Path) {
    let cutoff = std::time::SystemTime::now()
        - std::time::Duration::from_secs(MAX_CRASH_AGE_DAYS * 24 * 60 * 60);

    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        if let Ok(meta) = entry.metadata()
            && let Ok(modified) = meta.modified()
            && modified < cutoff
        {
            let _ = fs::remove_file(entry.path());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crash_report_includes_all_fields() {
        let report = format_crash_report(
            "2026-06-03_12-00-00.000",
            "src/foo.rs:10:5",
            "boom",
            "  0: frame_one\n  1: frame_two",
        );
        assert!(report.starts_with("opencode desktop crash report"));
        assert!(report.contains("time:     2026-06-03_12-00-00.000"));
        assert!(report.contains("location: src/foo.rs:10:5"));
        assert!(report.contains("message:  boom"));
        assert!(report.contains(std::env::consts::OS));
        assert!(report.contains(std::env::consts::ARCH));
        assert!(report.contains("backtrace:\n  0: frame_one"));
    }

    #[test]
    fn crash_report_handles_empty_backtrace() {
        let report = format_crash_report("t", "loc", "msg", "");
        assert!(report.contains("message:  msg"));
        assert!(report.trim_end().ends_with("backtrace:"));
    }

    fn renderer_payload() -> FatalRendererError {
        FatalRendererError {
            error: "TypeError: x is not a function".into(),
            url: "oc://renderer/session".into(),
            version: Some("2.0.0-beta.1".into()),
            platform: "desktop".into(),
            os: Some("macos".into()),
        }
    }

    #[test]
    fn renderer_report_includes_all_fields() {
        let report = format_renderer_report("2026-07-14_12-00-00.000", &renderer_payload());
        assert!(report.starts_with("opencode desktop fatal renderer error"));
        assert!(report.contains("time:     2026-07-14_12-00-00.000"));
        assert!(report.contains("version:  2.0.0-beta.1"));
        assert!(report.contains("os:       macos"));
        assert!(report.contains("platform: desktop"));
        assert!(report.contains("url:      oc://renderer/session"));
        assert!(report.contains("error:\nTypeError: x is not a function"));
        assert!(report.contains(std::env::consts::ARCH));
    }

    #[test]
    fn renderer_report_falls_back_when_optional_fields_absent() {
        let payload = FatalRendererError {
            version: None,
            os: None,
            ..renderer_payload()
        };
        let report = format_renderer_report("t", &payload);
        assert!(report.contains("version:  unknown"));
        // Falls back to the host OS rather than emitting an empty field.
        assert!(report.contains(&format!("os:       {}", std::env::consts::OS)));
    }
}
