use std::path::PathBuf;
use std::sync::Arc;
use tauri::Manager;
use tauri::Emitter;

mod audio;
mod usdb;
mod songbook;
mod tunnel;

// ── USDB managed state ────────────────────────────────────────────────────────
struct UsdbState(tokio::sync::Mutex<usdb::UsdbClient>);

// ── Songbook state ────────────────────────────────────────────────────────────
struct SongbookServerState(songbook::SongbookState);

// ── Tunnel state ─────────────────────────────────────────────────────────────
struct TunnelServerState {
    handle: std::sync::Arc<std::sync::Mutex<Option<tunnel::TunnelHandle>>>,
}

#[tauri::command]
async fn songbook_start(state: tauri::State<'_, SongbookServerState>, songs: Vec<songbook::SongEntry>) -> Result<String, String> {
    let sb = &state.0;
    *sb.songs.lock().unwrap() = songs;
    songbook::start_server(sb.clone());
    let ip = local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "localhost".to_string());
    Ok(format!("http://{}:{}", ip, songbook::SONGBOOK_PORT))
}

#[tauri::command]
async fn songbook_stop(state: tauri::State<'_, SongbookServerState>) -> Result<(), String> {
    songbook::stop_server(&state.0);
    Ok(())
}

#[tauri::command]
fn songbook_update_songs(state: tauri::State<'_, SongbookServerState>, songs: Vec<songbook::SongEntry>) {
    *state.0.songs.lock().unwrap() = songs;
}

#[tauri::command]
async fn tunnel_start(
    tunnel_state: tauri::State<'_, TunnelServerState>,
    sb_state: tauri::State<'_, SongbookServerState>,
    songs: Vec<songbook::SongEntry>,
) -> Result<serde_json::Value, String> {
    // Stop any existing tunnel
    {
        let mut handle = tunnel_state.handle.lock().unwrap();
        if let Some(h) = handle.take() {
            h.stop();
        }
    }
    // Ensure songbook server is running
    let sb = &sb_state.0;
    *sb.songs.lock().unwrap() = songs;
    if sb.shutdown_tx.lock().unwrap().is_none() {
        songbook::start_server(sb.clone());
    }
    // Start the public tunnel
    let handle = tunnel::start_tunnel(songbook::SONGBOOK_PORT).await?;
    let url = handle.url.clone();
    let pin = handle.pin.clone();
    *sb.pin.lock().unwrap() = Some(pin.clone());
    *tunnel_state.handle.lock().unwrap() = Some(handle);
    Ok(serde_json::json!({ "url": url, "pin": pin }))
}

#[tauri::command]
async fn tunnel_stop(
    tunnel_state: tauri::State<'_, TunnelServerState>,
    sb_state: tauri::State<'_, SongbookServerState>,
) -> Result<(), String> {
    let mut handle = tunnel_state.handle.lock().unwrap();
    if let Some(h) = handle.take() {
        h.stop();
    }
    *sb_state.0.pin.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
fn songbook_get_url() -> Option<String> {
    local_ip_address::local_ip()
        .map(|ip| format!("http://{}:{}", ip, songbook::SONGBOOK_PORT))
        .ok()
}

#[tauri::command]
async fn usdb_login(
    state: tauri::State<'_, UsdbState>,
    username: String,
    password: String,
) -> Result<bool, String> {
    let client = state.0.lock().await;
    client.login(&username, &password).await
}

#[tauri::command]
async fn usdb_fetch_catalog(
    app: tauri::AppHandle,
    state: tauri::State<'_, UsdbState>,
    last_mtime: i64,
    last_song_ids: Vec<u32>,
) -> Result<Vec<usdb::UsdbCatalogEntry>, String> {
    let client = state.0.lock().await;
    if last_mtime == 0 {
        // Full sync — emit progress events per page
        client.fetch_all_songs(|fetched, total| {
            let _ = app.emit("usdb:progress", serde_json::json!({ "fetched": fetched, "total": total }));
        }).await
    } else {
        // Incremental sync
        client.fetch_updated_songs(last_mtime, &last_song_ids).await
    }
}

#[tauri::command]
async fn usdb_get_song_txt(
    state: tauri::State<'_, UsdbState>,
    song_id: u32,
) -> Result<String, String> {
    let client = state.0.lock().await;
    client.get_song_txt(song_id).await
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn mime_for_ext(ext: &str) -> &'static str {
    match ext.to_lowercase().as_str() {
        "mp4" | "m4v"  => "video/mp4",
        "webm"         => "video/webm",
        "mov"          => "video/quicktime",
        "mpg" | "mpeg" => "video/mpeg",
        "avi"          => "video/x-msvideo",
        "mkv"          => "video/x-matroska",
        "mp3"          => "audio/mpeg",
        "m4a"          => "audio/mp4",
        "ogg"          => "audio/ogg",
        "wav"          => "audio/wav",
        "jpg" | "jpeg" => "image/jpeg",
        "png"          => "image/png",
        "gif"          => "image/gif",
        "webp"         => "image/webp",
        _              => "application/octet-stream",
    }
}

/// Returns the path to the bundled FFmpeg binary.
/// In dev mode it falls back to a system `ffmpeg` on PATH.
fn ffmpeg_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    let candidate = resource_dir.join("ffmpeg.exe");
    #[cfg(not(target_os = "windows"))]
    let candidate = resource_dir.join("ffmpeg");

    if candidate.exists() {
        return Ok(candidate);
    }

    // Dev fallback: use system ffmpeg
    which_ffmpeg("ffmpeg").ok_or_else(|| {
        "FFmpeg not found. Run scripts/download-ffmpeg.sh (macOS) or scripts/download-ffmpeg.ps1 (Windows) first.".to_string()
    })
}

fn which_ffmpeg(name: &str) -> Option<PathBuf> {
    std::process::Command::new("which")
        .arg(name)
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                let p = String::from_utf8_lossy(&o.stdout).trim().to_string();
                if !p.is_empty() { Some(PathBuf::from(p)) } else { None }
            } else {
                None
            }
        })
}

/// Transcode a video file to MP4/H.264 in the system temp directory.
/// Returns the path of the output file; caller deletes it via delete_temp_file.
#[tauri::command]
async fn transcode_to_mp4(app: tauri::AppHandle, input: String) -> Result<String, String> {
    let ffmpeg = ffmpeg_path(&app)?;

    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let out = std::env::temp_dir().join(format!("ultrastardj_preview_{}.mp4", ts));

    let result = std::process::Command::new(&ffmpeg)
        .args([
            "-i", &input,
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "28",
            "-c:a", "aac",
            "-movflags", "+faststart",
            "-y",
            out.to_str().unwrap_or_default(),
        ])
        .output()
        .map_err(|e| format!("Failed to launch FFmpeg: {}", e))?;

    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr);
        return Err(format!("FFmpeg failed ({}): {}", result.status, &stderr[stderr.len().saturating_sub(500)..]))
    }

    Ok(out.to_string_lossy().into_owned())
}

/// Delete a temporary transcoded preview file.
#[tauri::command]
fn delete_temp_file(path: String) {
    let _ = std::fs::remove_file(&path);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let audio_state = Arc::new(audio::AudioState::new());
    let usdb_state = UsdbState(tokio::sync::Mutex::new(usdb::UsdbClient::new()));
    let songbook_state = SongbookServerState(songbook::SongbookState::new());
    let tunnel_state = TunnelServerState {
        handle: std::sync::Arc::new(std::sync::Mutex::new(None)),
    };

    tauri::Builder::default()
        .manage(audio_state.clone())
        .manage(usdb_state)
        .manage(songbook_state)
        .manage(tunnel_state)
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .register_uri_scheme_protocol("media", |_app, request| {
            let uri = request.uri().to_string();
            let raw = uri
                .trim_start_matches("media://localhost")
                .trim_start_matches('/');
            let decoded = urlencoding::decode(raw)
                .unwrap_or_else(|_| raw.into());
            let path = if decoded.starts_with('/') {
                decoded.into_owned()
            } else {
                format!("/{}", decoded)
            };
            match std::fs::read(&path) {
                Ok(data) => {
                    let ext = std::path::Path::new(&path)
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("");
                    let mime = mime_for_ext(ext);
                    tauri::http::Response::builder()
                        .header("Content-Type", mime)
                        .header("Access-Control-Allow-Origin", "*")
                        .body(data)
                        .unwrap()
                }
                Err(e) => {
                    tauri::http::Response::builder()
                        .status(404)
                        .header("Content-Type", "text/plain")
                        .body(format!("Not found: {}", e).into_bytes())
                        .unwrap()
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            transcode_to_mp4,
            delete_temp_file,
            audio::list_audio_input_devices,
            audio::start_mic_monitor,
            audio::stop_mic_monitor,
            audio::set_mic_mix_gain,
            audio::set_mic_input_gain,
            audio::set_mic_threshold,
            audio::debug_open_streams,
            audio::list_audio_output_devices,
            audio::get_default_output_device_name,
            audio::open_output_channel,
            audio::push_audio_pcm,
            audio::close_output_channel,
            usdb_login,
            usdb_fetch_catalog,
            usdb_get_song_txt,
            songbook_start,
            songbook_stop,
            songbook_update_songs,
            songbook_get_url,
            tunnel_start,
            tunnel_stop,
        ])
        .setup(move |app| {
            audio::start_hotplug_watcher(app.handle().clone(), audio_state);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
