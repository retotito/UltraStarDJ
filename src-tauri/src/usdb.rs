use std::sync::Arc;
use std::time::Duration;

use regex::Regex;
use reqwest::{cookie::Jar, Client};
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::sync::LazyLock;

const BASE_URL: &str = "https://usdb.animux.de";
const SONGS_PER_PAGE: u32 = 100;

// ── Data models ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsdbCatalogEntry {
    #[serde(rename = "songId")]
    pub song_id: u32,
    pub artist: String,
    pub title: String,
    pub genre: String,
    pub year: Option<u16>,
    pub language: String,
    pub creator: String,
    pub edition: String,
    #[serde(rename = "goldenNotes")]
    pub golden_notes: bool,
    pub rating: f32,
    pub views: u32,
    #[serde(rename = "coverUrl")]
    pub cover_url: Option<String>,
    #[serde(rename = "usdbMtime")]
    pub usdb_mtime: i64,
}

// ── HTTP Client ───────────────────────────────────────────────────────────────

pub struct UsdbClient {
    client: Client,
    _cookie_jar: Arc<Jar>,
}

impl UsdbClient {
    pub fn new() -> Self {
        let cookie_jar = Arc::new(Jar::default());
        let client = Client::builder()
            .cookie_provider(cookie_jar.clone())
            .user_agent("UltrastarDJ/1.0")
            .timeout(Duration::from_secs(30))
            .build()
            .expect("Failed to create USDB HTTP client");
        Self { client, _cookie_jar: cookie_jar }
    }

    /// Login to USDB. Returns true on success, false on wrong credentials.
    pub async fn login(&self, username: &str, password: &str) -> Result<bool, String> {
        let url = format!("{}/", BASE_URL);
        let params = [("user", username), ("pass", password), ("login", "Login")];

        let response = self.client.post(&url).form(&params).send().await
            .map_err(|e| format!("Login request failed: {}", e))?;

        let body = response.text().await
            .map_err(|e| format!("Failed to read login response: {}", e))?;

        if body.contains("Login or Password invalid") {
            return Ok(false);
        }

        Ok(true)
    }

    /// Fetch full catalog (all songs, paginated).
    pub async fn fetch_all_songs(
        &self,
        progress_cb: impl Fn(u32, u32) + Send,
    ) -> Result<Vec<UsdbCatalogEntry>, String> {
        let url = format!("{}/index.php?link=list", BASE_URL);
        let mut all_songs: Vec<UsdbCatalogEntry> = Vec::new();

        let mut start: u32 = 0;
        loop {
            let limit_str = SONGS_PER_PAGE.to_string();
            let start_str = start.to_string();
            let params = [
                ("order", "id"),
                ("ud", "asc"),
                ("limit", &limit_str),
                ("start", &start_str),
                ("details", "1"),
            ];

            let response = self.client.post(&url).form(&params).send().await
                .map_err(|e| format!("Catalog fetch failed at offset {}: {}", start, e))?;

            let body = response.text().await
                .map_err(|e| format!("Failed to read catalog page at offset {}: {}", start, e))?;

            let batch = parse_song_list(&body);
            let batch_len = batch.len() as u32;
            all_songs.extend(batch);

            progress_cb(all_songs.len() as u32, 0);

            if batch_len < SONGS_PER_PAGE {
                break; // last page
            }
            start += SONGS_PER_PAGE;
        }

        Ok(all_songs)
    }

    /// Incremental sync: fetch only songs changed since `last_mtime`.
    pub async fn fetch_updated_songs(
        &self,
        last_mtime: i64,
        last_song_ids: &[u32],
    ) -> Result<Vec<UsdbCatalogEntry>, String> {
        let url = format!("{}/index.php?link=list", BASE_URL);
        let mut updated: Vec<UsdbCatalogEntry> = Vec::new();

        let mut start: u32 = 0;
        loop {
            let limit_str = SONGS_PER_PAGE.to_string();
            let start_str = start.to_string();
            let params = [
                ("order", "lastchange"),
                ("ud", "desc"),
                ("limit", &limit_str),
                ("start", &start_str),
                ("details", "1"),
            ];

            let response = self.client.post(&url).form(&params).send().await
                .map_err(|e| format!("Incremental fetch failed at offset {}: {}", start, e))?;

            let body = response.text().await
                .map_err(|e| format!("Failed to read incremental page at offset {}: {}", start, e))?;

            let batch = parse_song_list(&body);
            let batch_len = batch.len() as u32;
            let mut reached_watermark = false;

            for song in &batch {
                if song.usdb_mtime > last_mtime
                    || (song.usdb_mtime == last_mtime && !last_song_ids.contains(&song.song_id))
                {
                    updated.push(song.clone());
                } else {
                    reached_watermark = true;
                }
            }

            if reached_watermark || batch_len < SONGS_PER_PAGE {
                break;
            }
            start += SONGS_PER_PAGE;
        }

        Ok(updated)
    }

    /// Fetch the raw .txt content for a song ID.
    pub async fn get_song_txt(&self, song_id: u32) -> Result<String, String> {
        let url = format!("{}/index.php?link=gettxt&id={}", BASE_URL, song_id);
        let response = self.client
            .post(&url)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body("wd=1")
            .send()
            .await
            .map_err(|e| format!("Failed to fetch song txt: {}", e))?;

        if response.status() == 404 {
            return Err(format!("Song {} not found on USDB", song_id));
        }

        let body = response.text().await
            .map_err(|e| format!("Failed to read song txt: {}", e))?;

        Ok(body)
    }
}

// ── HTML parser ───────────────────────────────────────────────────────────────

static YT_ID_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[A-Za-z0-9_-]{11}$").unwrap());

fn get_td_text(el: &scraper::ElementRef) -> String {
    el.text().collect::<String>().trim().to_string()
}

pub fn parse_song_list(html: &str) -> Vec<UsdbCatalogEntry> {
    let document = Html::parse_document(html);
    let row_sel = Selector::parse("tr[data-songid]").unwrap();
    let td_sel  = Selector::parse("td").unwrap();
    let img_sel = Selector::parse("img").unwrap();

    let mut songs = Vec::new();

    for row in document.select(&row_sel) {
        let song_id: u32 = match row.value().attr("data-songid").and_then(|v| v.parse().ok()) {
            Some(id) => id,
            None => continue,
        };
        let usdb_mtime: i64 = row.value().attr("data-lastchange")
            .and_then(|v| v.parse().ok()).unwrap_or(0);

        let tds: Vec<_> = row.select(&td_sel).collect();
        if tds.len() < 12 { continue; }

        let cover_url = tds[1].select(&img_sel).next()
            .and_then(|img| img.value().attr("src"))
            .map(|src| if src.starts_with("http") {
                src.to_string()
            } else {
                format!("{}/{}", BASE_URL, src.trim_start_matches('/'))
            });

        let artist   = get_td_text(&tds[2]);
        let title    = get_td_text(&tds[3]);
        let genre    = get_td_text(&tds[4]);
        let year     = get_td_text(&tds[5]).parse::<u16>().ok();
        let edition  = get_td_text(&tds[6]);
        let golden   = tds[7].text().collect::<String>().trim().to_lowercase() == "yes";
        let language = get_td_text(&tds[8]);
        let creator  = get_td_text(&tds[9]);
        let rating: f32 = get_td_text(&tds[10]).parse().unwrap_or(0.0);
        let views: u32  = get_td_text(&tds[11]).replace(',', "").parse().unwrap_or(0);

        songs.push(UsdbCatalogEntry {
            song_id, artist, title, genre, year, language, creator, edition,
            golden_notes: golden, rating, views, cover_url, usdb_mtime,
        });
    }

    songs
}

// ── Extract YouTube ID from USDB song page ────────────────────────────────────

pub fn extract_youtube_id_from_txt(txt: &str) -> Option<String> {
    for line in txt.lines() {
        let line = line.trim();
        if line.starts_with("#YOUTUBE:") || line.starts_with("#VIDEO:") {
            let val = line.splitn(2, ':').nth(1).unwrap_or("").trim();
            // Extract 11-char YouTube ID
            if YT_ID_RE.is_match(val) { return Some(val.to_string()); }
            // Try URL extraction
            if let Some(cap) = regex::Regex::new(r"[?&vi=]+([A-Za-z0-9_-]{11})").unwrap()
                .captures(val) {
                return cap.get(1).map(|m| m.as_str().to_string());
            }
        }
    }
    None
}
