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
        let known = device_names(&host);
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

fn device_names(host: &Host) -> Vec<String> {
    host.input_devices()
        .map(|devs| {
            devs.filter_map(|d| d.name().ok())
                .collect()
        })
        .unwrap_or_default()
}

fn find_device(host: &Host, id: &str) -> Option<Device> {
    host.input_devices().ok()?.find(|d| {
        d.name().map(|n| n == id).unwrap_or(false)
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
    let Ok(devices) = host.input_devices() else {
        return vec![];
    };
    devices
        .filter_map(|d| {
            let name = d.name().ok()?;
            let config = d.default_input_config().ok()?;
            Some(AudioInputDevice {
                id: name.clone(),
                name,
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
            let current = device_names(&host);

            let mut known = state.known_devices.lock().unwrap();

            // Detect removals
            let removed: Vec<String> = known
                .iter()
                .filter(|n| !current.contains(n))
                .cloned()
                .collect();

            // Detect additions
            let added: Vec<String> = current
                .iter()
                .filter(|n| !known.contains(n))
                .cloned()
                .collect();

            if !removed.is_empty() || !added.is_empty() {
                *known = current.clone();
                drop(known); // release lock before emitting

                // Emit generic devices-changed so frontend can refresh dropdown
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
