use log::{Level, Log, Metadata, Record};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct JsonFileLogger {
    path: PathBuf,
    level: Level,
    stdout: bool,
    buf: Mutex<Vec<u8>>,
}

impl JsonFileLogger {
    pub fn new(path: PathBuf, level: Level, stdout: bool) -> Self {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        Self {
            path,
            level,
            stdout,
            buf: Mutex::new(Vec::with_capacity(512)),
        }
    }

    pub fn init(self, max_level: log::LevelFilter) {
        log::set_max_level(max_level);
        log::set_boxed_logger(Box::new(self)).expect("logger already set");
    }
}

impl Log for JsonFileLogger {
    fn enabled(&self, metadata: &Metadata) -> bool {
        metadata.level() <= self.level
    }

    fn log(&self, record: &Record) {
        if !self.enabled(record.metadata()) {
            return;
        }

        let now = chrono::Utc::now();
        let line = serde_json::json!({
            "@timestamp": now.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            "level": record.level().to_string(),
            "logger": record.target(),
            "message": format!("{}", record.args()),
            "app": "teacherease-parent-companion",
        });

        let json_str = match serde_json::to_string(&line) {
            Ok(s) => s,
            Err(_) => return,
        };

        if self.stdout {
            println!("{json_str}");
        }

        if let Ok(mut file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)
        {
            let _ = writeln!(file, "{json_str}");
        }
    }

    fn flush(&self) {
        let _ = &self.buf;
    }
}
