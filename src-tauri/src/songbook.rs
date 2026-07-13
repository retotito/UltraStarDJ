use axum::{
    extract::{Query, State},
    response::Html,
    routing::get,
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
}

impl SongbookState {
    pub fn new() -> Self {
        Self {
            songs: Arc::new(Mutex::new(vec![])),
            shutdown_tx: Arc::new(Mutex::new(None)),
        }
    }
}

// ── HTTP handlers ─────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct SearchParams {
    q: Option<String>,
    lang: Option<String>,
    genre: Option<String>,
}

async fn get_songs(
    State(state): State<SongbookState>,
    Query(params): Query<SearchParams>,
) -> Json<Vec<SongEntry>> {
    let songs = state.songs.lock().unwrap();
    let q = params.q.as_deref().unwrap_or("").to_lowercase();
    let lang = params.lang.as_deref().unwrap_or("");
    let genre = params.genre.as_deref().unwrap_or("");

    // Require at least 1 char to search, else return empty
    if q.is_empty() && lang.is_empty() && genre.is_empty() {
        return Json(vec![]);
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

    Json(results)
}

async fn get_filters(State(state): State<SongbookState>) -> Json<serde_json::Value> {
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
    Json(serde_json::json!({ "languages": langs, "genres": genres }))
}

async fn get_index() -> Html<&'static str> {
    Html(GUEST_HTML)
}

// ── Start / Stop ─────────────────────────────────────────────────────────────

pub fn start_server(state: SongbookState) {
    let (tx, rx) = tokio::sync::oneshot::channel::<()>();
    *state.shutdown_tx.lock().unwrap() = Some(tx);

    let app = Router::new()
        .route("/", get(get_index))
        .route("/api/songs", get(get_songs))
        .route("/api/filters", get(get_filters))
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
    input, select { background: #2a2a3a; border: 1px solid #3a3a4a; color: #e8e8f0; border-radius: 8px; padding: 10px 14px; font-size: 15px; outline: none; }
    input { flex: 1; min-width: 160px; }
    select { min-width: 120px; }
    input:focus, select:focus { border-color: #c8b8ff; }
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
  </style>
</head>
<body>
  <header>
    <h1>UltrastarDJ Songbook</h1>
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
    function starsStr(views) {
      if (!views) return '';
      if (views >= 2000) return '&#9733;&#9733;&#9733;&#9733;';
      if (views >= 1000) return '&#9733;&#9733;&#9733;';
      if (views >= 500)  return '&#9733;&#9733;';
      if (views >= 100)  return '&#9733;';
      return '';
    }
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
        var res = await fetch('/api/songs?' + params.toString());
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
        var res = await fetch('/api/filters');
        var data = await res.json();
        document.getElementById('lang').innerHTML = '<option value="">Language</option>' + data.languages.map(function(l) { return '<option>' + l + '</option>'; }).join('');
        document.getElementById('genre').innerHTML = '<option value="">Genre</option>' + data.genres.map(function(g) { return '<option>' + g + '</option>'; }).join('');
      } catch(e) {}
    }
    loadFilters();
  </script>
</body>
</html>"#;
