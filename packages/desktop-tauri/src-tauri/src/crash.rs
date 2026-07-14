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
}
