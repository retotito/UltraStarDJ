use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{Html, IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tokio::net::TcpListener;
pub const SONGBOOK_PORT: u16 = 8080;

// ── Song entry sent from the frontend ────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SongEntry {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub year: Option<u16>,
    pub language: Option<String>,
    pub genre: Option<String>,
    #[serde(rename = "usdbViews")]
    pub usdb_views: Option<u32>,
    #[serde(rename = "sourceId")]
    pub source_id: String,
}

// ── Shared state ─────────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct SongbookState {
    pub songs: Arc<Mutex<Vec<SongEntry>>>,
    pub shutdown_tx: Arc<Mutex<Option<tokio::sync::oneshot::Sender<()>>>>,
    /// Optional 4-digit party PIN. If set, API calls require ?pin=XXXX.
    pub pin: Arc<Mutex<Option<String>>>,
}

impl SongbookState {
    pub fn new() -> Self {
        Self {
            songs: Arc::new(Mutex::new(vec![])),
            shutdown_tx: Arc::new(Mutex::new(None)),
            pin: Arc::new(Mutex::new(None)),
        }
    }
}

// ── HTTP handlers ─────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct SearchParams {
    q: Option<String>,
    lang: Option<String>,
    genre: Option<String>,
    pin: Option<String>,
}

fn check_pin(state: &SongbookState, provided: Option<&str>) -> bool {
    let stored = state.pin.lock().unwrap().clone();
    match stored {
        None => true,
        Some(required) => provided == Some(required.as_str()),
    }
}

async fn get_songs(
    State(state): State<SongbookState>,
    Query(params): Query<SearchParams>,
) -> Response {
    if !check_pin(&state, params.pin.as_deref()) {
        return (StatusCode::UNAUTHORIZED, Json::<Vec<SongEntry>>(vec![])).into_response();
    }

    let songs = state.songs.lock().unwrap();
    let q = params.q.as_deref().unwrap_or("").to_lowercase();
    let lang = params.lang.as_deref().unwrap_or("");
    let genre = params.genre.as_deref().unwrap_or("");

    if q.is_empty() && lang.is_empty() && genre.is_empty() {
        return Json(Vec::<SongEntry>::new()).into_response();
    }

    let results: Vec<SongEntry> = songs
        .iter()
        .filter(|s| {
            let match_q = q.is_empty()
                || s.title.to_lowercase().contains(&q)
                || s.artist.to_lowercase().contains(&q);
            let match_lang = lang.is_empty()
                || s.language.as_deref().unwrap_or("") == lang;
            let match_genre = genre.is_empty()
                || s.genre.as_deref().unwrap_or("") == genre;
            match_q && match_lang && match_genre
        })
        .take(150)
        .cloned()
        .collect();

    Json(results).into_response()
}

#[derive(Deserialize)]
struct FilterParams {
    pin: Option<String>,
}

async fn get_filters(
    State(state): State<SongbookState>,
    Query(params): Query<FilterParams>,
) -> Response {
    if !check_pin(&state, params.pin.as_deref()) {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({}))).into_response();
    }

    let songs = state.songs.lock().unwrap();
    let mut langs: Vec<String> = songs.iter()
        .filter_map(|s| s.language.clone())
        .filter(|l| !l.is_empty())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();
    langs.sort();
    let mut genres: Vec<String> = songs.iter()
        .filter_map(|s| s.genre.clone())
        .filter(|g| !g.is_empty())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();
    genres.sort();
    Json(serde_json::json!({ "languages": langs, "genres": genres })).into_response()
}

#[derive(Deserialize)]
struct VerifyPinBody {
    pin: String,
}

async fn verify_pin(
    State(state): State<SongbookState>,
    Json(body): Json<VerifyPinBody>,
) -> Json<serde_json::Value> {
    let ok = check_pin(&state, Some(body.pin.as_str()));
    Json(serde_json::json!({ "ok": ok }))
}

async fn get_index() -> Html<&'static str> {
    Html(GUEST_HTML)
}

/// Minimal YouTube IFrame proxy page served from http://localhost:8080/youtube
/// YouTube allows embedding from http://localhost, so this avoids error 153
/// that occurs when the embedding origin is tauri://localhost.
/// The page communicates with the parent via postMessage.
/// Query params: ?videoId=XXX&controls=1 (optional, for preview player)
async fn get_youtube_proxy(Query(params): Query<std::collections::HashMap<String, String>>) -> impl IntoResponse {
    let video_id = params.get("videoId").cloned().unwrap_or_default();
    let controls = if params.get("controls").map(|v| v == "1").unwrap_or(false) { 1 } else { 0 };
    let autoload = if video_id.is_empty() { "false" } else { "true" };
    let html = format!(r#"<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="referrer" content="strict-origin-when-cross-origin">
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  html, body {{ width: 100%; height: 100%; background: #000; overflow: hidden; }}
  #player {{ width: 100%; height: 100%; }}
</style>
</head>
<body>
<div id="player"></div>
<script>
  var ytPlayer = null;
  var initialVideoId = '{video_id}';
  var controls = {controls};
  var autoload = {autoload};

  function onYouTubeIframeAPIReady() {{
    if (autoload && initialVideoId) loadVideo(initialVideoId);
  }}

  function loadVideo(videoId, startSeconds) {{
    if (ytPlayer) {{
      ytPlayer.loadVideoById({{ videoId: videoId, startSeconds: startSeconds || 0 }});
      return;
    }}
    ytPlayer = new YT.Player('player', {{
      videoId: videoId,
      playerVars: {{
        autoplay: 0, mute: 0, controls: controls,
        disablekb: controls ? 0 : 1, fs: 0, rel: 0,
        start: startSeconds || 0,
      }},
      events: {{
        onReady: function() {{
          ytPlayer.setPlaybackQuality('tiny');
          parent.postMessage({{ type: 'yt-ready' }}, '*');
        }},
        onStateChange: function(e) {{
          parent.postMessage({{ type: 'yt-state', data: e.data }}, '*');
        }},
        onError: function(e) {{
          parent.postMessage({{ type: 'yt-error', data: e.data }}, '*');
        }},
      }},
    }});
  }}

  window.addEventListener('message', function(e) {{
    var msg = e.data;
    if (!msg || !msg.cmd) return;
    switch (msg.cmd) {{
      case 'load':
        loadVideo(msg.videoId, msg.start);
        break;
      case 'play':   if (ytPlayer) ytPlayer.playVideo(); break;
      case 'pause':  if (ytPlayer) ytPlayer.pauseVideo(); break;
      case 'stop':   if (ytPlayer) ytPlayer.stopVideo(); break;
      case 'volume': if (ytPlayer) ytPlayer.setVolume(msg.value); break;
      case 'getTime':
        parent.postMessage({{ type: 'yt-time', t: ytPlayer ? ytPlayer.getCurrentTime() : 0 }}, '*');
        break;
    }}
  }});

  var tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
</script>
</body>
</html>"#, video_id = video_id, controls = controls, autoload = autoload);

    axum::response::Response::builder()
        .header("Content-Type", "text/html; charset=utf-8")
        .header("Access-Control-Allow-Origin", "*")
        .body(axum::body::Body::from(html))
        .unwrap()
}

// ── Start / Stop ─────────────────────────────────────────────────────────────

pub fn start_server(state: SongbookState) {
    let (tx, rx) = tokio::sync::oneshot::channel::<()>();
    *state.shutdown_tx.lock().unwrap() = Some(tx);

    let app = Router::new()
        .route("/", get(get_index))
        .route("/youtube", get(get_youtube_proxy))
        .route("/api/songs", get(get_songs))
        .route("/api/filters", get(get_filters))
        .route("/api/verify-pin", post(verify_pin))
        .with_state(state);

    tokio::spawn(async move {
        let listener = match TcpListener::bind(format!("0.0.0.0:{}", SONGBOOK_PORT)).await {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[songbook] Failed to bind port {}: {}", SONGBOOK_PORT, e);
                return;
            }
        };
        println!("[songbook] Server started on port {}", SONGBOOK_PORT);
        axum::serve(listener, app)
            .with_graceful_shutdown(async { let _ = rx.await; })
            .await
            .ok();
        println!("[songbook] Server stopped");
    });
}

pub fn stop_server(state: &SongbookState) {
    if let Some(tx) = state.shutdown_tx.lock().unwrap().take() {
        let _ = tx.send(());
    }
}

// ── Guest HTML (mobile-friendly songbook) ────────────────────────────────────


// -- Guest HTML (mobile-friendly songbook) ------------------------------------

const GUEST_HTML: &str = r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>UltrastarDJ Songbook</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f0f13; color: #e8e8f0; min-height: 100vh; }
    header { background: #1a1a24; padding: 16px 20px; position: sticky; top: 0; z-index: 10; border-bottom: 1px solid #2a2a3a; }
    header h1 { font-size: 18px; font-weight: 700; color: #c8b8ff; margin-bottom: 10px; }
    .search-row { display: flex; gap: 8px; flex-wrap: wrap; }
    input[type=search], select { background: #2a2a3a; border: 1px solid #3a3a4a; color: #e8e8f0; border-radius: 8px; padding: 10px 14px; font-size: 15px; outline: none; }
    input[type=search] { flex: 1; min-width: 160px; }
    select { min-width: 120px; }
    input[type=search]:focus, select:focus { border-color: #c8b8ff; }
    .count { font-size: 12px; color: #888; padding: 8px 20px 4px; }
    .song-list { padding: 0 12px 80px; }
    .song { padding: 12px; border-bottom: 1px solid #1e1e28; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .song-info { flex: 1; min-width: 0; }
    .song-title { font-size: 15px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .song-artist { font-size: 13px; color: #aaa; margin-top: 2px; }
    .song-meta { display: flex; gap: 8px; margin-top: 4px; flex-wrap: wrap; }
    .tag { font-size: 11px; background: #2a2a3a; border-radius: 4px; padding: 2px 6px; color: #bbb; }
    .stars { font-size: 13px; color: #f5c518; white-space: nowrap; }
    .hint { text-align: center; padding: 60px 20px; color: #666; font-size: 15px; }
    .pin-overlay { display: none; position: fixed; inset: 0; background: #0f0f13; z-index: 100; justify-content: center; align-items: center; }
    .pin-overlay.visible { display: flex; }
    .pin-card { background: #1a1a24; border: 1px solid #2a2a3a; border-radius: 16px; padding: 32px 28px; width: 280px; display: flex; flex-direction: column; align-items: center; gap: 16px; }
    .pin-card h2 { color: #c8b8ff; font-size: 20px; font-weight: 700; }
    .pin-card p { color: #888; font-size: 13px; text-align: center; line-height: 1.5; }
    .pin-input { background: #2a2a3a; border: 2px solid #3a3a4a; color: #e8e8f0; border-radius: 12px; padding: 14px; font-size: 32px; font-weight: 700; letter-spacing: 14px; text-align: center; width: 100%; outline: none; }
    .pin-input:focus { border-color: #c8b8ff; }
    .pin-btn { background: #c8b8ff; color: #1a1a24; border: none; border-radius: 10px; padding: 14px 32px; font-size: 16px; font-weight: 700; cursor: pointer; width: 100%; }
    .pin-btn:active { opacity: 0.8; }
    .pin-error { color: #ff6b6b; font-size: 13px; min-height: 18px; text-align: center; }
  </style>
</head>
<body>
  <div class="pin-overlay" id="pinOverlay">
    <div class="pin-card">
      <h2>&#127881; Party PIN</h2>
      <p>Ask the DJ for the 4-digit PIN to browse songs.</p>
      <input class="pin-input" id="pinInput" type="number" inputmode="numeric" pattern="[0-9]*"
        placeholder="0000"
        oninput="if(this.value.length>4)this.value=this.value.slice(0,4)"
        onkeydown="if(event.key==='Enter')submitPin()"/>
      <button class="pin-btn" onclick="submitPin()">Join the Party</button>
      <span class="pin-error" id="pinError"></span>
    </div>
  </div>

  <header>
    <h1>&#127926; UltrastarDJ Songbook</h1>
    <div class="search-row">
      <input id="search" type="search" placeholder="Search songs..." oninput="onInput()"/>
      <select id="lang" onchange="doSearch()"><option value="">Language</option></select>
      <select id="genre" onchange="doSearch()"><option value="">Genre</option></select>
    </div>
  </header>
  <div class="count" id="count"></div>
  <div class="song-list" id="list"><div class="hint">Type to search...</div></div>

  <script>
    var debounce = null;
    var savedPin = sessionStorage.getItem('sb_pin') || '';

    function starsStr(views) {
      if (!views) return '';
      if (views >= 2000) return '&#9733;&#9733;&#9733;&#9733;';
      if (views >= 1000) return '&#9733;&#9733;&#9733;';
      if (views >= 500)  return '&#9733;&#9733;';
      if (views >= 100)  return '&#9733;';
      return '';
    }

    function apiHeaders() { return { 'bypass-tunnel-reminder': '1' }; }
    function pinParam() { return savedPin ? '&pin=' + encodeURIComponent(savedPin) : ''; }

    function onInput() {
      clearTimeout(debounce);
      debounce = setTimeout(doSearch, 300);
    }

    async function doSearch() {
      var q = document.getElementById('search').value.trim();
      var lang = document.getElementById('lang').value;
      var genre = document.getElementById('genre').value;
      if (!q && !lang && !genre) {
        document.getElementById('list').innerHTML = '<div class="hint">Type to search...</div>';
        document.getElementById('count').textContent = '';
        return;
      }
      var params = new URLSearchParams();
      if (q) params.set('q', q);
      if (lang) params.set('lang', lang);
      if (genre) params.set('genre', genre);
      try {
        var res = await fetch('/api/songs?' + params.toString() + pinParam(), { headers: apiHeaders() });
        if (res.status === 401) { showPinOverlay(); return; }
        var songs = await res.json();
        document.getElementById('count').textContent = songs.length === 150
          ? '150+ results - refine your search'
          : songs.length + ' songs found';
        if (!songs.length) {
          document.getElementById('list').innerHTML = '<div class="hint">No songs found</div>';
          return;
        }
        document.getElementById('list').innerHTML = songs.map(function(s) {
          return '<div class="song"><div class="song-info"><div class="song-title">' + s.title + '</div>'
            + '<div class="song-artist">' + s.artist + '</div>'
            + '<div class="song-meta">'
            + (s.year ? '<span class="tag">' + s.year + '</span>' : '')
            + (s.language ? '<span class="tag">' + s.language + '</span>' : '')
            + (s.genre ? '<span class="tag">' + s.genre + '</span>' : '')
            + '</div></div><div class="stars">' + starsStr(s.usdbViews) + '</div></div>';
        }).join('');
      } catch(e) {
        document.getElementById('list').innerHTML = '<div class="hint">Failed to load. Is the app running?</div>';
      }
    }

    async function loadFilters() {
      try {
        var res = await fetch('/api/filters?pin=' + encodeURIComponent(savedPin), { headers: apiHeaders() });
        if (res.status === 401) { showPinOverlay(); return; }
        var data = await res.json();
        document.getElementById('lang').innerHTML = '<option value="">Language</option>'
          + data.languages.map(function(l) { return '<option>' + l + '</option>'; }).join('');
        document.getElementById('genre').innerHTML = '<option value="">Genre</option>'
          + data.genres.map(function(g) { return '<option>' + g + '</option>'; }).join('');
      } catch(e) {}
    }

    function showPinOverlay() {
      document.getElementById('pinOverlay').classList.add('visible');
      setTimeout(function() { document.getElementById('pinInput').focus(); }, 100);
    }

    async function submitPin() {
      var pin = document.getElementById('pinInput').value.trim();
      document.getElementById('pinError').textContent = '';
      try {
        var res = await fetch('/api/verify-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'bypass-tunnel-reminder': '1' },
          body: JSON.stringify({ pin: pin })
        });
        var data = await res.json();
        if (data.ok) {
          savedPin = pin;
          sessionStorage.setItem('sb_pin', pin);
          document.getElementById('pinOverlay').classList.remove('visible');
          loadFilters();
        } else {
          document.getElementById('pinError').textContent = 'Wrong PIN, try again.';
          document.getElementById('pinInput').value = '';
          document.getElementById('pinInput').focus();
        }
      } catch(e) {
        document.getElementById('pinError').textContent = 'Connection failed.';
      }
    }

    loadFilters();
  </script>
</body>
</html>"#;
