use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

static LOG_PATH: OnceLock<PathBuf> = OnceLock::new();

fn resolve_log_path() -> PathBuf {
    LOG_PATH
        .get_or_init(|| {
            let root = dirs::data_local_dir()
                .unwrap_or_else(std::env::temp_dir)
                .join("nocode-x-studio")
                .join("logs");
            let _ = fs::create_dir_all(&root);
            root.join("sidecar.log")
        })
        .clone()
}

pub fn log_line(message: impl AsRef<str>) {
    let path = resolve_log_path();
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or_default();
    let line = format!(
        "[{timestamp}] [pid:{}] {}\n",
        std::process::id(),
        message.as_ref()
    );

    let _ = std::io::stderr().write_all(line.as_bytes());

    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = file.write_all(line.as_bytes());
    }
}
