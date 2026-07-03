use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, Host, SampleFormat, StreamConfig};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

// ── Public types ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct AudioInputDevice {
    pub id: String,
    pub name: String,
    pub channels: u16,
}

#[derive(Debug, Clone, Serialize)]
pub struct MicLevelEvent {
    pub player_id: u8,
    pub rms: f32, // 0.0 – 1.0
}

#[derive(Debug, Clone, Serialize)]
pub struct MicDisconnectedEvent {
    pub device_id: String,
    pub player_id: u8,
}

#[derive(Debug, Clone, Serialize)]
pub struct MicReconnectedEvent {
    pub device_id: String,
    pub player_id: u8,
}

// ── Event names ───────────────────────────────────────────────────────────────

pub const EVT_MIC_LEVEL: &str = "mic:level";
pub const EVT_MIC_DISCONNECTED: &str = "mic:disconnected";
pub const EVT_MIC_RECONNECTED: &str = "mic:reconnected";
pub const EVT_DEVICES_CHANGED: &str = "mic:devices-changed";

// ── Active stream state ───────────────────────────────────────────────────────

struct ActiveStream {
    _stream: cpal::Stream, // kept alive; dropped on stop
    device_id: String,
}

// cpal::Stream is !Send on CoreAudio (contains *mut). We hold it behind a
// Mutex and never send it across threads — only create/drop on the command thread.
unsafe impl Send for ActiveStream {}

pub struct AudioState {
    streams: Mutex<HashMap<u8, ActiveStream>>, // player_id → stream
    /// snapshot of input device names for hot-plug detection
    known_devices: Mutex<Vec<String>>,
}

unsafe impl Sync for AudioState {}

impl AudioState {
    pub fn new() -> Self {
        let host = cpal::default_host();
        let known = device_ids(&host);
        AudioState {
            streams: Mutex::new(HashMap::new()),
            known_devices: Mutex::new(known),
        }
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn host() -> Host {
    cpal::default_host()
}

/// Enumerate input devices and assign unique IDs.
/// Duplicate names get a `#2`, `#3` suffix so two "USB Microphone" dongles
/// are distinguishable. Returns (unique_id, Device) pairs.
fn enumerate_devices(host: &Host) -> Vec<(String, Device)> {
    let Ok(devs) = host.input_devices() else { return vec![] };
    let mut name_counts: HashMap<String, usize> = HashMap::new();
    devs.filter_map(|d| {
        let name = d.name().ok()?;
        let count = name_counts.entry(name.clone()).or_insert(0);
        *count += 1;
        let id = if *count == 1 {
            name
        } else {
            format!("{}#{}", name, count)
        };
        Some((id, d))
    })
    .collect()
}

/// Returns the unique IDs of all current input devices.
fn device_ids(host: &Host) -> Vec<String> {
    enumerate_devices(host).into_iter().map(|(id, _)| id).collect()
}

/// Find a device by its unique ID (strips `#N` suffix to locate the Nth device
/// with that base name).
fn find_device(host: &Host, id: &str) -> Option<Device> {
    // Parse optional "#N" suffix
    let (base_name, target_index) = if let Some(pos) = id.rfind('#') {
        let suffix = &id[pos + 1..];
        if let Ok(n) = suffix.parse::<usize>() {
            (&id[..pos], n)
        } else {
            (id, 1)
        }
    } else {
        (id, 1)
    };

    let mut count = 0usize;
    host.input_devices().ok()?.find(|d| {
        if d.name().map(|n| n == base_name).unwrap_or(false) {
            count += 1;
            count == target_index
        } else {
            false
        }
    })
}

/// Compute RMS from a mono f32 buffer, returns 0.0–1.0
fn rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let sum_sq: f32 = samples.iter().map(|s| s * s).sum();
    (sum_sq / samples.len() as f32).sqrt()
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_audio_input_devices() -> Vec<AudioInputDevice> {
    let host = host();
    enumerate_devices(&host)
        .into_iter()
        .filter_map(|(id, d)| {
            let config = d.default_input_config().ok()?;
            Some(AudioInputDevice {
                name: id.clone(),
                id,
                channels: config.channels(),
            })
        })
        .collect()
}

#[tauri::command]
pub fn start_mic_monitor(
    app: AppHandle,
    state: tauri::State<Arc<AudioState>>,
    device_id: String,
    channel: String, // "left" | "right" | "mono"
    player_id: u8,
) -> Result<(), String> {
    let host = host();
    let device = find_device(&host, &device_id)
        .ok_or_else(|| format!("Device '{}' not found", device_id))?;

    let default_config = device
        .default_input_config()
        .map_err(|e| e.to_string())?;

    let sample_rate = default_config.sample_rate();
    let total_channels = default_config.channels() as usize;
    let ch_index: usize = match channel.as_str() {
        "right" if total_channels > 1 => 1,
        _ => 0, // left or mono
    };

    let config = StreamConfig {
        channels: default_config.channels(),
        sample_rate,
        buffer_size: cpal::BufferSize::Default,
    };

    let app_clone = app.clone();

    // We build as f32; cpal will convert if needed via SampleFormat
    let stream = match default_config.sample_format() {
        SampleFormat::F32 => build_stream_f32(
            &device, &config, total_channels, ch_index, player_id, app_clone,
        ),
        SampleFormat::I16 => build_stream_i16(
            &device, &config, total_channels, ch_index, player_id, app_clone,
        ),
        SampleFormat::U16 => build_stream_u16(
            &device, &config, total_channels, ch_index, player_id, app_clone,
        ),
        _ => Err("Unsupported sample format".to_string()),
    }?;

    stream.play().map_err(|e| e.to_string())?;

    let mut streams = state.streams.lock().unwrap();
    // stop previous stream for this player if any
    streams.remove(&player_id);
    streams.insert(
        player_id,
        ActiveStream {
            _stream: stream,
            device_id,
        },
    );

    Ok(())
}

#[tauri::command]
pub fn stop_mic_monitor(
    state: tauri::State<Arc<AudioState>>,
    player_id: u8,
) -> Result<(), String> {
    let mut streams = state.streams.lock().unwrap();
    streams.remove(&player_id);
    Ok(())
}

// ── Stream builders ───────────────────────────────────────────────────────────

fn build_stream_f32(
    device: &Device,
    config: &StreamConfig,
    total_ch: usize,
    ch_idx: usize,
    player_id: u8,
    app: AppHandle,
) -> Result<cpal::Stream, String> {
    device
        .build_input_stream(
            config,
            move |data: &[f32], _| {
                let mono: Vec<f32> = data
                    .chunks(total_ch)
                    .filter_map(|frame| frame.get(ch_idx).copied())
                    .collect();
                let level = rms(&mono);
                let _ = app.emit(EVT_MIC_LEVEL, MicLevelEvent { player_id, rms: level });
            },
            move |_err| {},
            None,
        )
        .map_err(|e| e.to_string())
}

fn build_stream_i16(
    device: &Device,
    config: &StreamConfig,
    total_ch: usize,
    ch_idx: usize,
    player_id: u8,
    app: AppHandle,
) -> Result<cpal::Stream, String> {
    device
        .build_input_stream(
            config,
            move |data: &[i16], _| {
                let mono: Vec<f32> = data
                    .chunks(total_ch)
                    .filter_map(|frame| frame.get(ch_idx).map(|&s| s as f32 / i16::MAX as f32))
                    .collect();
                let level = rms(&mono);
                let _ = app.emit(EVT_MIC_LEVEL, MicLevelEvent { player_id, rms: level });
            },
            move |_err| {},
            None,
        )
        .map_err(|e| e.to_string())
}

fn build_stream_u16(
    device: &Device,
    config: &StreamConfig,
    total_ch: usize,
    ch_idx: usize,
    player_id: u8,
    app: AppHandle,
) -> Result<cpal::Stream, String> {
    device
        .build_input_stream(
            config,
            move |data: &[u16], _| {
                let mono: Vec<f32> = data
                    .chunks(total_ch)
                    .filter_map(|frame| {
                        frame
                            .get(ch_idx)
                            .map(|&s| (s as f32 - 32768.0) / 32768.0)
                    })
                    .collect();
                let level = rms(&mono);
                let _ = app.emit(EVT_MIC_LEVEL, MicLevelEvent { player_id, rms: level });
            },
            move |_err| {},
            None,
        )
        .map_err(|e| e.to_string())
}

// ── Hot-plug watcher ──────────────────────────────────────────────────────────

/// Call this once at startup in a background thread.
/// Polls every 2s for device list changes; emits connect/disconnect events.
/// Also cross-checks active streams and emits mic:disconnected per player.
pub fn start_hotplug_watcher(app: AppHandle, state: Arc<AudioState>) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_secs(2));

            let host = host();
            let current = device_ids(&host);

            let mut known = state.known_devices.lock().unwrap();

            // Count occurrences per id (handles duplicate names like "USB Microphone#2")
            let mut current_counts: HashMap<String, usize> = HashMap::new();
            for id in &current { *current_counts.entry(id.clone()).or_insert(0) += 1; }
            let mut known_counts: HashMap<String, usize> = HashMap::new();
            for id in known.iter() { *known_counts.entry(id.clone()).or_insert(0) += 1; }

            // Removed: ids whose count decreased
            let removed: Vec<String> = known_counts.iter()
                .flat_map(|(id, &kc)| {
                    let cc = *current_counts.get(id).unwrap_or(&0);
                    (0..kc.saturating_sub(cc)).map(move |_| id.clone())
                })
                .collect();

            // Added: ids whose count increased
            let added: Vec<String> = current_counts.iter()
                .flat_map(|(id, &cc)| {
                    let kc = *known_counts.get(id).unwrap_or(&0);
                    (0..cc.saturating_sub(kc)).map(move |_| id.clone())
                })
                .collect();

            if !removed.is_empty() || !added.is_empty() {
                *known = current.clone();
                drop(known);

                let all = list_audio_input_devices();
                let _ = app.emit(EVT_DEVICES_CHANGED, all);

                // Check if any active stream's device was removed
                let streams = state.streams.lock().unwrap();
                for (player_id, active) in streams.iter() {
                    if removed.contains(&active.device_id) {
                        let _ = app.emit(
                            EVT_MIC_DISCONNECTED,
                            MicDisconnectedEvent {
                                device_id: active.device_id.clone(),
                                player_id: *player_id,
                            },
                        );
                    }
                }

                // Emit reconnected for previously-lost devices that came back
                // (frontend can decide to auto-restart monitor)
                for name in &added {
                    // We don't know the player_id here — emit with 0 as wildcard
                    // frontend matches by device_id
                    let _ = app.emit(
                        EVT_MIC_RECONNECTED,
                        MicReconnectedEvent {
                            device_id: name.clone(),
                            player_id: 0,
                        },
                    );
                }
            } else {
                drop(known);
            }
        }
    });
}
