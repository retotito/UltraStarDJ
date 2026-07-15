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
    // Only start the server if it isn't already running (e.g. started by tunnel)
    if sb.shutdown_tx.lock().unwrap().is_none() {
        songbook::start_server(sb.clone());
    }
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

/// Returns the path to the bundled yt-dlp binary.
/// In dev mode falls back to the Homebrew/system yt-dlp on PATH.
fn ytdlp_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    let candidate = resource_dir.join("resources").join("yt-dlp");
    if candidate.exists() {
        return Ok(candidate);
    }
    // Dev fallback: system yt-dlp
    which_ffmpeg("yt-dlp")
        .or_else(|| which_ffmpeg("yt_dlp"))
        .ok_or_else(|| "yt-dlp not found. Run scripts/download-ytdlp.sh first, or install via: brew install yt-dlp".to_string())
}

/// Download a YouTube song's audio to a temp file for preview playback.
///
/// Strategy:
/// 1. Try Invidious API (fast, no auth, cross-platform) to get a direct stream URL
/// 2. Download the stream via reqwest with browser headers
/// 3. Fall back to yt-dlp (with Safari/Chrome cookies) if Invidious fails
///
/// Returns the temp file path — the JS side serves it via media:// protocol.
#[tauri::command]
async fn get_youtube_audio_url(app: tauri::AppHandle, state: tauri::State<'_, SongbookServerState>, video_id: String) -> Result<String, String> {
    let out_path = std::env::temp_dir().join(format!("ytpreview_{}.m4a", &video_id));

    // Return cached file if already downloaded
    if out_path.exists() && out_path.metadata().map(|m| m.len() > 10_000).unwrap_or(false) {
        state.0.youtube_files.lock().unwrap().insert(video_id.clone(), out_path.clone());
        return Ok(format!("http://localhost:{}/ytaudio/{}", songbook::SONGBOOK_PORT, video_id));
    }

    // ── Strategy 1: Invidious API ─────────────────────────────────────────
    let invidious_instances = [
        "https://invidious.kavin.rocks",
        "https://inv.riverside.rocks",
    ];

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(3))  // short timeout — fall through fast if instance is down
        .build()
        .map_err(|e| e.to_string())?;

    for instance in &invidious_instances {
        let api_url = format!("{}/api/v1/videos/{}", instance, video_id);
        if let Ok(resp) = client.get(&api_url).send().await {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                // Find the best audio-only stream (audio/mp4 preferred, then webm)
                let audio_url = json["adaptiveFormats"].as_array()
                    .and_then(|fmts| {
                        // prefer audio/mp4 (m4a), fallback to any audio
                        fmts.iter()
                            .filter(|f| f["type"].as_str().map(|t| t.starts_with("audio/mp4")).unwrap_or(false))
                            .max_by_key(|f| f["bitrate"].as_u64().unwrap_or(0))
                            .or_else(|| fmts.iter()
                                .filter(|f| f["type"].as_str().map(|t| t.starts_with("audio/")).unwrap_or(false))
                                .max_by_key(|f| f["bitrate"].as_u64().unwrap_or(0)))
                    })
                    .and_then(|fmt| fmt["url"].as_str().map(String::from));

                if let Some(stream_url) = audio_url {
                    // Download the stream to a temp file
                    if let Ok(audio_resp) = client.get(&stream_url)
                        .header("Referer", "https://www.youtube.com/")
                        .send().await
                    {
                        if audio_resp.status().is_success() {
                            if let Ok(bytes) = audio_resp.bytes().await {
                                if bytes.len() > 10_000 {
                                    if std::fs::write(&out_path, &bytes).is_ok() {
                                        state.0.youtube_files.lock().unwrap().insert(video_id.clone(), out_path.clone());
        return Ok(format!("http://localhost:{}/ytaudio/{}", songbook::SONGBOOK_PORT, video_id));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // ── Strategy 2: yt-dlp with browser cookies ───────────────────────────
    let ytdlp = ytdlp_path(&app)?;

    // Try cookies from different browsers cross-platform
    #[cfg(target_os = "macos")]
    let browsers = &["safari", "chrome", "firefox"][..];
    #[cfg(target_os = "windows")]
    let browsers = &["chrome", "edge", "firefox"][..];
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let browsers = &["chrome", "firefox"][..];

    for browser in browsers {
        let result = std::process::Command::new(&ytdlp)
            .args([
                "-f", "bestaudio[ext=m4a]/bestaudio/best",
                "--no-playlist",
                "--cookies-from-browser", browser,
                "-o", out_path.to_str().unwrap_or(""),
                &format!("https://www.youtube.com/watch?v={}", video_id),
            ])
            .output();

        if let Ok(out) = result {
            if out.status.success() && out_path.exists() {
                state.0.youtube_files.lock().unwrap().insert(video_id.clone(), out_path.clone());
        return Ok(format!("http://localhost:{}/ytaudio/{}", songbook::SONGBOOK_PORT, video_id));
            }
        }
    }

    Err("Could not download YouTube audio. Try logging into YouTube in Safari (macOS) or Chrome (Windows).".to_string())
}

/// Convert a local file path to a media:// URL for the frontend.
fn path_to_media_url(path: &std::path::Path) -> String {
    let encoded = path.to_string_lossy()
        .split('/')
        .map(|s| urlencoding::encode(s).into_owned())
        .collect::<Vec<_>>()
        .join("/");
    format!("media://localhost{}", encoded)
}

/// Returns the path to the bundled FFmpeg binary.
/// In dev mode it falls back to a system `ffmpeg` on PATH.
fn ffmpeg_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;

    // Tauri 2 bundles "resources/ffmpeg" preserving the subdirectory,
    // so the file lands at {resource_dir}/resources/ffmpeg inside the .app.
    #[cfg(target_os = "windows")]
    let candidate = resource_dir.join("resources").join("ffmpeg.exe");
    #[cfg(not(target_os = "windows"))]
    let candidate = resource_dir.join("resources").join("ffmpeg");

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

    // In production, pick a free port so the app serves from http://localhost:PORT
    // instead of tauri://localhost — this makes YouTube embeds work.
    // The localhost-ipc capability file grants IPC access to http://localhost:**.
    #[cfg(not(dev))]
    let port: u16 = portpicker::pick_unused_port().expect("failed to find unused port");

    // Build the plugin chain. tauri-plugin-localhost is only registered in
    // production — in dev the Vite dev server handles asset serving.
    let mut builder = tauri::Builder::default();
    #[cfg(not(dev))]
    { builder = builder.plugin(tauri_plugin_localhost::Builder::new(port).build()); }

    builder
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

            let ext = std::path::Path::new(&path)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("");
            let mime = mime_for_ext(ext);

            let file_len = match std::fs::metadata(&path) {
                Ok(m) => m.len(),
                Err(e) => return tauri::http::Response::builder()
                    .status(404)
                    .header("Content-Type", "text/plain")
                    .body(format!("Not found: {}", e).into_bytes())
                    .unwrap(),
            };

            // Parse optional Range header for seeking support
            let range_header = request.headers()
                .get("Range")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.strip_prefix("bytes="))
                .map(|s| s.to_string());

            let (start, end, is_range) = if let Some(range) = range_header {
                let parts: Vec<&str> = range.splitn(2, '-').collect();
                let s: u64 = parts.get(0).and_then(|v| v.parse().ok()).unwrap_or(0);
                let e: u64 = parts.get(1).and_then(|v| v.parse().ok()).unwrap_or(file_len - 1);
                (s, e.min(file_len - 1), true)
            } else {
                (0, file_len - 1, false)
            };

            let chunk_len = end - start + 1;

            use std::io::{Read, Seek, SeekFrom};
            let data = match std::fs::File::open(&path) {
                Ok(mut f) => {
                    let mut buf = vec![0u8; chunk_len as usize];
                    if f.seek(SeekFrom::Start(start)).is_err() || f.read_exact(&mut buf).is_err() {
                        return tauri::http::Response::builder()
                            .status(416)
                            .body(b"Range not satisfiable".to_vec())
                            .unwrap();
                    }
                    buf
                }
                Err(e) => return tauri::http::Response::builder()
                    .status(404)
                    .header("Content-Type", "text/plain")
                    .body(format!("Not found: {}", e).into_bytes())
                    .unwrap(),
            };

            let mut builder = tauri::http::Response::builder()
                .header("Content-Type", mime)
                .header("Accept-Ranges", "bytes")
                .header("Access-Control-Allow-Origin", "*")
                .header("Content-Length", chunk_len.to_string());

            if is_range {
                builder = builder
                    .status(206)
                    .header("Content-Range", format!("bytes {}-{}/{}", start, end, file_len));
            }

            builder.body(data).unwrap()
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_youtube_audio_url,
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
            // Auto-start the songbook server (YouTube proxy at /youtube).
            // Must be spawned on Tauri's async runtime since setup() is synchronous.
            let sb = app.state::<SongbookServerState>().inner().0.clone();
            tauri::async_runtime::spawn(async move {
                songbook::start_server(sb);
            });

            // Create the main window dynamically.
            //   dev:  WebviewUrl::App  → Vite dev server (http://localhost:1420)
            //   prod: WebviewUrl::External → tauri-plugin-localhost (http://localhost:PORT)
            //   IPC permissions for the localhost origin are granted via
            //   capabilities/localhost-ipc.json (http://localhost:**).
            #[cfg(not(dev))]
            let webview_url = {
                use tauri::{Url, WebviewUrl};
                let url: Url = format!("http://localhost:{}", port).parse().unwrap();
                WebviewUrl::External(url)
            };
            #[cfg(dev)]
            let webview_url = tauri::WebviewUrl::App(std::path::PathBuf::from("/"));

            tauri::WebviewWindowBuilder::new(app, "main", webview_url)
                .title("UltrastarDJ")
                .inner_size(1280.0, 800.0)
                .maximized(true)
                .min_inner_size(900.0, 600.0)
                .accept_first_mouse(true)
                .devtools(true)
                .build()?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
