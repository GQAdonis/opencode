use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::{EnvFilter, fmt, layer::SubscriberExt, util::SubscriberInitExt};

const MAX_LOG_AGE_DAYS: u64 = 7;
#[allow(dead_code)]
const TAIL_LINES: usize = 1000;
/// Skip files larger than this in the debug export (match Electron's 50MB cap).
const MAX_EXPORT_FILE_BYTES: u64 = 50 * 1024 * 1024;

static LOG_PATH: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();

pub fn init(log_dir: &Path) -> WorkerGuard {
    std::fs::create_dir_all(log_dir).expect("failed to create log directory");

    cleanup(log_dir);

    let timestamp = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S");
    let filename = format!("opencode-desktop_{timestamp}.log");
    let log_path = log_dir.join(&filename);

    LOG_PATH
        .set(log_path.clone())
        .expect("logging already initialized");

    let file = File::create(&log_path).expect("failed to create log file");
    let (non_blocking, guard) = tracing_appender::non_blocking(file);

    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        if cfg!(debug_assertions) {
            EnvFilter::new("opencode_lib=debug,opencode_desktop=debug,sidecar=debug")
        } else {
            EnvFilter::new("opencode_lib=info,opencode_desktop=info,sidecar=info")
        }
    });

    tracing_subscriber::registry()
        .with(filter)
        .with(fmt::layer().with_writer(std::io::stderr))
        .with(fmt::layer().with_writer(non_blocking).with_ansi(false))
        .init();

    guard
}

#[allow(dead_code)]
pub fn tail() -> String {
    let Some(path) = LOG_PATH.get() else {
        return String::new();
    };

    let Ok(file) = File::open(path) else {
        return String::new();
    };

    let lines: Vec<String> = BufReader::new(file).lines().map_while(Result::ok).collect();

    let start = lines.len().saturating_sub(TAIL_LINES);
    lines[start..].join("\n")
}

/// Bundle logs + crash reports into a timestamped folder in the user's Downloads
/// directory, write a manifest, and reveal it. Local-only diagnostics export,
/// mirroring the Electron app's debug-log export (folder instead of zip to avoid
/// pulling in a zip dependency; equally diagnostic and shareable).
#[tauri::command]
#[specta::specta]
pub fn export_debug_logs(app: AppHandle) -> Result<String, String> {
    let downloads = app
        .path()
        .download_dir()
        .map_err(|e| format!("cannot resolve Downloads dir: {e}"))?;

    let timestamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let out_dir = downloads.join(format!("opencode-debug-{timestamp}"));
    std::fs::create_dir_all(&out_dir).map_err(|e| format!("cannot create export dir: {e}"))?;

    // App log dir (includes the crashes/ subdir from crash::install).
    if let Ok(app_log_dir) = app.path().app_log_dir() {
        copy_dir_filtered(&app_log_dir, &out_dir.join("desktop-logs"));
    }

    // Server logs live under XDG_STATE_HOME/opencode/log (XDG_STATE_HOME is set
    // to the app local data dir for the sidecar) and ~/.local/state/opencode/log.
    for server_log in server_log_dirs(&app) {
        if server_log.exists() {
            let label = format!(
                "server-logs-{}",
                server_log
                    .parent()
                    .and_then(|p| p.file_name())
                    .and_then(|n| n.to_str())
                    .unwrap_or("opencode")
            );
            copy_dir_filtered(&server_log, &out_dir.join(label));
        }
    }

    let manifest = serde_json::json!({
        "generatedAt": chrono::Local::now().to_rfc3339(),
        "version": option_env!("CARGO_PKG_VERSION").unwrap_or("unknown"),
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "appLogDir": app.path().app_log_dir().ok().map(|p| p.display().to_string()),
        "crashDir": crate::crash::crash_dir().map(|p| p.display().to_string()),
    });
    let _ = std::fs::write(
        out_dir.join("manifest.json"),
        serde_json::to_vec_pretty(&manifest).unwrap_or_default(),
    );

    // Reveal the folder in the system file manager.
    let path = out_dir.display().to_string();
    let _ = tauri_plugin_opener::open_path(path.clone(), None::<&str>);

    tracing::info!(export = %path, "wrote debug log export");
    Ok(path)
}

fn server_log_dirs(app: &AppHandle) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Ok(local) = app.path().app_local_data_dir() {
        dirs.push(local.join("opencode").join("log"));
    }
    if let Some(home) = dirs::home_dir() {
        dirs.push(home.join(".local").join("state").join("opencode").join("log"));
    }
    dirs
}

/// Copy a directory's files into `dest`, skipping files over the size cap.
/// Best-effort: individual failures are logged, not propagated.
fn copy_dir_filtered(src: &Path, dest: &Path) {
    copy_dir_filtered_capped(src, dest, MAX_EXPORT_FILE_BYTES);
}

/// Core of `copy_dir_filtered` with an explicit byte cap, so tests can use a
/// small threshold instead of writing a 50MB fixture. Skips symlinks (avoids
/// following links into a cycle) and files larger than `max_bytes`; recurses
/// into subdirectories.
fn copy_dir_filtered_capped(src: &Path, dest: &Path, max_bytes: u64) {
    let Ok(entries) = std::fs::read_dir(src) else {
        return;
    };
    if std::fs::create_dir_all(dest).is_err() {
        return;
    }
    for entry in entries.flatten() {
        let path = entry.path();
        // Use symlink-aware metadata so we don't follow links into a cycle.
        let Ok(meta) = entry.path().symlink_metadata() else {
            continue;
        };
        if meta.file_type().is_symlink() {
            continue;
        }
        let target = dest.join(entry.file_name());
        if meta.is_dir() {
            copy_dir_filtered_capped(&path, &target, max_bytes);
        } else if meta.len() <= max_bytes {
            if let Err(e) = std::fs::copy(&path, &target) {
                tracing::warn!(file = %path.display(), "skipped in export: {e}");
            }
        }
    }
}

fn cleanup(log_dir: &Path) {
    let cutoff = std::time::SystemTime::now()
        - std::time::Duration::from_secs(MAX_LOG_AGE_DAYS * 24 * 60 * 60);

    let Ok(entries) = std::fs::read_dir(log_dir) else {
        return;
    };

    for entry in entries.flatten() {
        if let Ok(meta) = entry.metadata()
            && let Ok(modified) = meta.modified()
            && modified < cutoff
        {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn unique_tmp(tag: &str) -> std::path::PathBuf {
        // Avoid Date/rand (unavailable/forbidden in some harnesses): derive a
        // unique-enough dir from the process id + a static counter.
        use std::sync::atomic::{AtomicU32, Ordering};
        static N: AtomicU32 = AtomicU32::new(0);
        let n = N.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!("oc-export-test-{tag}-{}-{n}", std::process::id()))
    }

    #[test]
    fn copy_skips_oversized_and_recurses() {
        let src = unique_tmp("src");
        let dest = unique_tmp("dest");
        let _ = fs::remove_dir_all(&src);
        let _ = fs::remove_dir_all(&dest);
        fs::create_dir_all(src.join("sub")).unwrap();

        fs::write(src.join("small.log"), b"hello").unwrap(); // 5 bytes — kept
        fs::write(src.join("big.log"), vec![0u8; 200]).unwrap(); // 200 bytes — skipped (cap 100)
        fs::write(src.join("sub").join("nested.log"), b"deep").unwrap(); // recursed

        copy_dir_filtered_capped(&src, &dest, 100);

        assert!(dest.join("small.log").exists(), "small file should be copied");
        assert!(!dest.join("big.log").exists(), "oversized file should be skipped");
        assert!(
            dest.join("sub").join("nested.log").exists(),
            "subdirectory files should be copied recursively"
        );

        let _ = fs::remove_dir_all(&src);
        let _ = fs::remove_dir_all(&dest);
    }

    #[cfg(unix)]
    #[test]
    fn copy_skips_symlinks() {
        let src = unique_tmp("symsrc");
        let dest = unique_tmp("symdest");
        let _ = fs::remove_dir_all(&src);
        let _ = fs::remove_dir_all(&dest);
        fs::create_dir_all(&src).unwrap();

        fs::write(src.join("real.log"), b"x").unwrap();
        std::os::unix::fs::symlink(src.join("real.log"), src.join("link.log")).unwrap();

        copy_dir_filtered_capped(&src, &dest, 1024);

        assert!(dest.join("real.log").exists());
        assert!(!dest.join("link.log").exists(), "symlinks must be skipped");

        let _ = fs::remove_dir_all(&src);
        let _ = fs::remove_dir_all(&dest);
    }
}
