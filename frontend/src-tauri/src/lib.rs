use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

static BACKEND_CHILD: Mutex<Option<Child>> = Mutex::new(None);

fn is_port_open(port: u16) -> bool {
    TcpStream::connect_timeout(
        &format!("127.0.0.1:{}", port).parse().unwrap(),
        Duration::from_millis(500),
    )
    .is_ok()
}

fn find_app_dir() -> PathBuf {
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(dir) = exe_path.parent() {
            return dir.to_path_buf();
        }
    }
    PathBuf::from(".")
}

fn find_python(work_dir: &PathBuf) -> PathBuf {
    let candidates = [
        work_dir.join("runtime").join("Scripts").join("python.exe"),
        work_dir.join(".venv").join("Scripts").join("python.exe"),
    ];
    for c in &candidates {
        if c.exists() {
            return c.clone();
        }
    }
    PathBuf::from("python")
}

fn find_launcher_script(app_dir: &PathBuf) -> Option<(PathBuf, PathBuf)> {
    // 1. Check relative subdirectories (installed application or custom folder)
    let subdirs = [
        "backend",
        "_up_/_up_/backend",
        "resources/backend",
        "resources/_up_/_up_/backend",
        "app/backend",
    ];
    for sub in &subdirs {
        let candidate = app_dir.join(sub).join("launcher.py");
        if candidate.exists() {
            let work_dir = if *sub == "app/backend" {
                app_dir.join("app")
            } else if *sub == "_up_/_up_/backend" {
                app_dir.join("_up_").join("_up_")
            } else if sub.starts_with("resources") {
                candidate.parent().unwrap().parent().unwrap().to_path_buf()
            } else {
                app_dir.clone()
            };
            return Some((candidate, work_dir));
        }
    }

    // 2. Walk up directory tree (development or target/release execution)
    let mut current = app_dir.clone();
    for _ in 0..8 {
        let candidate = current.join("backend").join("launcher.py");
        if candidate.exists() {
            return Some((candidate, current));
        }
        if let Some(parent) = current.parent() {
            current = parent.to_path_buf();
        } else {
            break;
        }
    }

    // 3. Fallback: current working directory
    let cwd_launcher = PathBuf::from("backend").join("launcher.py");
    if cwd_launcher.exists() {
        return Some((cwd_launcher, PathBuf::from(".")));
    }
    None
}

fn get_configured_data_dir(app_dir: &PathBuf, work_dir: &PathBuf) -> PathBuf {
    let candidates = [
        app_dir.join("storage.json"),
        work_dir.join("storage.json"),
    ];
    for cfg_file in &candidates {
        if cfg_file.exists() {
            if let Ok(content) = std::fs::read_to_string(cfg_file) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(p) = val.get("dataPath").and_then(|v| v.as_str()) {
                        let custom = PathBuf::from(p);
                        if custom.is_absolute() || custom.exists() {
                            return custom;
                        }
                    }
                }
            }
        }
    }
    app_dir.join("data")
}

fn spawn_backend_if_needed() {
    if is_port_open(8001) {
        println!("[Tauri] Backend already running on port 8001.");
        return;
    }

    let app_dir = find_app_dir();
    let (launcher_path, work_dir) = match find_launcher_script(&app_dir) {
        Some(pair) => pair,
        None => {
            eprintln!("[Tauri] Could not locate backend/launcher.py.");
            return;
        }
    };

    let python_exe = find_python(&work_dir);
    let data_dir = get_configured_data_dir(&app_dir, &work_dir);
    let _ = std::fs::create_dir_all(&data_dir);
    let db_path = data_dir.join("aio_crm.db");

    println!("[Tauri] Starting backend engine: {:?} {:?}", python_exe, launcher_path);

    let mut cmd = Command::new(&python_exe);
    cmd.arg(&launcher_path)
        .current_dir(&work_dir)
        .env("SQLITE_DB_PATH", &db_path)
        .env("AUTH_DB_PATH", &db_path)
        .env("MEDIA_DATA_DIR", &data_dir)
        .env("PYTHONPATH", &work_dir)
        .env("TAURI_SUPERVISED", "1");

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    match cmd.spawn() {
        Ok(child) => {
            let mut lock = BACKEND_CHILD.lock().unwrap();
            *lock = Some(child);
            println!("[Tauri] Backend process spawned successfully.");
        }
        Err(e) => {
            eprintln!("[Tauri] Failed to spawn backend process: {}", e);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      spawn_backend_if_needed();
      Ok(())
    })
    .on_window_event(|window, event| {
      if let tauri::WindowEvent::CloseRequested { .. } = event {
        if let Ok(mut lock) = BACKEND_CHILD.lock() {
            if let Some(mut child) = lock.take() {
                let _ = child.kill();
            }
        }
        window.app_handle().exit(0);
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
