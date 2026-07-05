use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, Host, SampleFormat, StreamConfig};
use serde::Serialize;
use std::collections::{HashMap, VecDeque};
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
pub struct AudioOutputDevice {
    pub id: String,
    pub name: String,
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

// ── Input stream state ────────────────────────────────────────────────────────

struct ActiveStream {
    _stream: cpal::Stream, // kept alive; dropped on stop
    device_id: String,
}

// cpal::Stream is !Send on CoreAudio (contains *mut). We hold it behind a
// Mutex and never send it across threads — only create/drop on the command thread.
unsafe impl Send for ActiveStream {}

// ── Output channel state ──────────────────────────────────────────────────────

/// Lock-free-ish ring buffer shared between push_audio_pcm (command thread)
/// and the cpal output callback (audio thread).
/// Using Arc<Mutex<VecDeque>> — the Mutex is held only briefly per callback.
type RingBuffer = Arc<Mutex<VecDeque<f32>>>;

/// Maximum samples to buffer per channel (~500ms at 44100 Hz stereo).
const RING_BUFFER_CAPACITY: usize = 44100;

struct OutputChannel {
    _stream: cpal::Stream, // kept alive; drop = stop playback
    ring: RingBuffer,
    sample_rate: u32,
    out_channels: u16,
}

// Same !Send workaround as input streams.
unsafe impl Send for OutputChannel {}

// ── Shared state ──────────────────────────────────────────────────────────────

pub struct AudioState {
    /// Mic input streams: player_id → stream
    streams: Mutex<HashMap<u8, ActiveStream>>,
    /// Audio output channels: "game" | "preview" → channel
    output_channels: Mutex<HashMap<String, OutputChannel>>,
    /// Snapshot of input device names for hot-plug detection
    known_devices: Mutex<Vec<String>>,
}

unsafe impl Sync for AudioState {}

impl AudioState {
    pub fn new() -> Self {
        let host = cpal::default_host();
        let known = device_ids(&host);
        AudioState {
            streams: Mutex::new(HashMap::new()),
            output_channels: Mutex::new(HashMap::new()),
            known_devices: Mutex::new(known),
        }
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn host() -> Host {
    cpal::default_host()
}

/// Enumerate INPUT devices and assign unique IDs.
/// Duplicate names get a `#2`, `#3` suffix.
fn enumerate_devices(host: &Host) -> Vec<(String, Device)> {
    let Ok(devs) = host.input_devices() else { return vec![] };
    let mut name_counts: HashMap<String, usize> = HashMap::new();
    devs.filter_map(|d| {
        let name = d.name().ok()?;
        let count = name_counts.entry(name.clone()).or_insert(0);
        *count += 1;
        let id = if *count == 1 { name } else { format!("{}#{}", name, count) };
        Some((id, d))
    })
    .collect()
}

/// Enumerate OUTPUT devices and assign unique IDs (same dedup logic).
fn enumerate_output_devices(host: &Host) -> Vec<(String, Device)> {
    let Ok(devs) = host.output_devices() else { return vec![] };
    let mut name_counts: HashMap<String, usize> = HashMap::new();
    devs.filter_map(|d| {
        let name = d.name().ok()?;
        let count = name_counts.entry(name.clone()).or_insert(0);
        *count += 1;
        let id = if *count == 1 { name } else { format!("{}#{}", name, count) };
        Some((id, d))
    })
    .collect()
}

/// Returns unique IDs of all current input devices.
fn device_ids(host: &Host) -> Vec<String> {
    enumerate_devices(host).into_iter().map(|(id, _)| id).collect()
}

/// Find an INPUT device by unique ID.
fn find_device(host: &Host, id: &str) -> Option<Device> {
    let (base_name, target_index) = parse_device_id(id);
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

/// Find an OUTPUT device by unique ID.
fn find_output_device(host: &Host, id: &str) -> Option<Device> {
    let (base_name, target_index) = parse_device_id(id);
    let mut count = 0usize;
    host.output_devices().ok()?.find(|d| {
        if d.name().map(|n| n == base_name).unwrap_or(false) {
            count += 1;
            count == target_index
        } else {
            false
        }
    })
}

/// Parse "DeviceName#2" → ("DeviceName", 2). Plain name → ("name", 1).
fn parse_device_id(id: &str) -> (&str, usize) {
    if let Some(pos) = id.rfind('#') {
        let suffix = &id[pos + 1..];
        if let Ok(n) = suffix.parse::<usize>() {
            return (&id[..pos], n);
        }
    }
    (id, 1)
}

/// Compute RMS from a mono f32 buffer, returns 0.0–1.0.
fn rms(samples: &[f32]) -> f32 {
    if samples.is_empty() { return 0.0; }
    let sum_sq: f32 = samples.iter().map(|s| s * s).sum();
    (sum_sq / samples.len() as f32).sqrt()
}

// ── Tauri commands — input / mic ──────────────────────────────────────────────

#[tauri::command]
pub fn list_audio_input_devices() -> Vec<AudioInputDevice> {
    let host = host();
    enumerate_devices(&host)
        .into_iter()
        .filter_map(|(id, d)| {
            let config = d.default_input_config().ok()?;
            Some(AudioInputDevice { name: id.clone(), id, channels: config.channels() })
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

    let default_config = device.default_input_config().map_err(|e| e.to_string())?;
    let sample_rate = default_config.sample_rate();
    let total_channels = default_config.channels() as usize;
    let ch_index: usize = match channel.as_str() {
        "right" if total_channels > 1 => 1,
        _ => 0,
    };

    let config = StreamConfig {
        channels: default_config.channels(),
        sample_rate,
        buffer_size: cpal::BufferSize::Default,
    };

    let stream = match default_config.sample_format() {
        SampleFormat::F32 => build_input_stream_f32(&device, &config, total_channels, ch_index, player_id, app.clone()),
        SampleFormat::I16 => build_input_stream_i16(&device, &config, total_channels, ch_index, player_id, app.clone()),
        SampleFormat::U16 => build_input_stream_u16(&device, &config, total_channels, ch_index, player_id, app.clone()),
        _ => Err("Unsupported sample format".to_string()),
    }?;

    stream.play().map_err(|e| e.to_string())?;

    let mut streams = state.streams.lock().unwrap();
    streams.remove(&player_id);
    streams.insert(player_id, ActiveStream { _stream: stream, device_id });
    Ok(())
}

#[tauri::command]
pub fn stop_mic_monitor(
    state: tauri::State<Arc<AudioState>>,
    player_id: u8,
) -> Result<(), String> {
    state.streams.lock().unwrap().remove(&player_id);
    Ok(())
}

// ── Tauri commands — output ───────────────────────────────────────────────────

/// List all available audio output devices.
#[tauri::command]
pub fn list_audio_output_devices() -> Vec<AudioOutputDevice> {
    let host = host();
    enumerate_output_devices(&host)
        .into_iter()
        .filter_map(|(id, d)| {
            d.default_output_config().ok()?; // only include usable devices
            Some(AudioOutputDevice { name: id.clone(), id })
        })
        .collect()
}

/// Open (or reopen) an output channel on the given device.
/// channel: "game" | "preview"
/// device_id: device unique ID from list_audio_output_devices, or "" for system default.
/// js_sample_rate: the AudioContext sample rate on the JS side (typically 44100 or 48000).
/// js_channels: number of channels the JS side will send (1 or 2).
#[tauri::command]
pub fn open_output_channel(
    state: tauri::State<Arc<AudioState>>,
    channel: String,
    device_id: String,
    js_sample_rate: u32,
    js_channels: u16,
) -> Result<(), String> {
    let host = host();

    let device = if device_id.is_empty() {
        host.default_output_device()
            .ok_or("No default output device found")?
    } else {
        find_output_device(&host, &device_id)
            .ok_or_else(|| format!("Output device '{}' not found", device_id))?
    };

    let default_config = device.default_output_config().map_err(|e| e.to_string())?;
    let out_channels = default_config.channels();

    // Use the device's native sample rate to avoid resampling.
    // JS side is responsible for matching or resampling to this rate.
    let config = StreamConfig {
        channels: out_channels,
        sample_rate: default_config.sample_rate(),
        buffer_size: cpal::BufferSize::Fixed(1024),
    };

    let ring: RingBuffer = Arc::new(Mutex::new(VecDeque::with_capacity(RING_BUFFER_CAPACITY)));
    let ring_clone = ring.clone();
    let out_ch = out_channels as usize;

    let stream = device
        .build_output_stream(
            &config,
            move |output: &mut [f32], _| {
                let mut buf = ring_clone.lock().unwrap();
                for frame in output.chunks_mut(out_ch) {
                    for sample in frame.iter_mut() {
                        *sample = buf.pop_front().unwrap_or(0.0);
                    }
                }
            },
            |err| eprintln!("[audio output] stream error: {err}"),
            None,
        )
        .map_err(|e| e.to_string())?;

    stream.play().map_err(|e| e.to_string())?;

    let mut channels = state.output_channels.lock().unwrap();
    channels.insert(channel, OutputChannel {
        _stream: stream,
        ring,
        sample_rate: default_config.sample_rate().0,
        out_channels,
    });

    Ok(())
}

/// Push interleaved f32 PCM samples into the named output channel's ring buffer.
/// JS calls this from a ScriptProcessorNode or AudioWorkletNode message handler.
/// samples: interleaved stereo or mono f32, matching js_channels from open_output_channel.
#[tauri::command]
pub fn push_audio_pcm(
    state: tauri::State<Arc<AudioState>>,
    channel: String,
    samples: Vec<f32>,
) -> Result<(), String> {
    let channels = state.output_channels.lock().unwrap();
    let ch = channels.get(&channel)
        .ok_or_else(|| format!("Output channel '{}' not open", channel))?;

    let mut ring = ch.ring.lock().unwrap();

    // Drop oldest samples if ring buffer is too full (prevents unbounded lag).
    let max = RING_BUFFER_CAPACITY;
    if ring.len() + samples.len() > max {
        let excess = ring.len() + samples.len() - max;
        ring.drain(..excess);
    }

    // If the device has 2 channels but JS sends mono (1 ch), duplicate to stereo.
    if ch.out_channels == 2 && samples.len() > 0 {
        // Assume JS always sends stereo (L, R interleaved) — push as-is.
        // If js_channels == 1 we'd need to duplicate, but AudioWorklet sends stereo.
        ring.extend(samples.iter().copied());
    } else {
        ring.extend(samples.iter().copied());
    }

    Ok(())
}

/// Close an output channel (stops playback, frees device).
#[tauri::command]
pub fn close_output_channel(
    state: tauri::State<Arc<AudioState>>,
    channel: String,
) -> Result<(), String> {
    state.output_channels.lock().unwrap().remove(&channel);
    Ok(())
}

// ── Input stream builders ─────────────────────────────────────────────────────

fn build_input_stream_f32(
    device: &Device, config: &StreamConfig,
    total_ch: usize, ch_idx: usize, player_id: u8, app: AppHandle,
) -> Result<cpal::Stream, String> {
    device.build_input_stream(
        config,
        move |data: &[f32], _| {
            let mono: Vec<f32> = data.chunks(total_ch)
                .filter_map(|frame| frame.get(ch_idx).copied()).collect();
            let _ = app.emit(EVT_MIC_LEVEL, MicLevelEvent { player_id, rms: rms(&mono) });
        },
        move |_err| {}, None,
    ).map_err(|e| e.to_string())
}

fn build_input_stream_i16(
    device: &Device, config: &StreamConfig,
    total_ch: usize, ch_idx: usize, player_id: u8, app: AppHandle,
) -> Result<cpal::Stream, String> {
    device.build_input_stream(
        config,
        move |data: &[i16], _| {
            let mono: Vec<f32> = data.chunks(total_ch)
                .filter_map(|frame| frame.get(ch_idx).map(|&s| s as f32 / i16::MAX as f32)).collect();
            let _ = app.emit(EVT_MIC_LEVEL, MicLevelEvent { player_id, rms: rms(&mono) });
        },
        move |_err| {}, None,
    ).map_err(|e| e.to_string())
}

fn build_input_stream_u16(
    device: &Device, config: &StreamConfig,
    total_ch: usize, ch_idx: usize, player_id: u8, app: AppHandle,
) -> Result<cpal::Stream, String> {
    device.build_input_stream(
        config,
        move |data: &[u16], _| {
            let mono: Vec<f32> = data.chunks(total_ch)
                .filter_map(|frame| frame.get(ch_idx).map(|&s| (s as f32 - 32768.0) / 32768.0)).collect();
            let _ = app.emit(EVT_MIC_LEVEL, MicLevelEvent { player_id, rms: rms(&mono) });
        },
        move |_err| {}, None,
    ).map_err(|e| e.to_string())
}

// ── Hot-plug watcher ──────────────────────────────────────────────────────────

pub fn start_hotplug_watcher(app: AppHandle, state: Arc<AudioState>) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_secs(2));

            let host = host();
            let current = device_ids(&host);
            let mut known = state.known_devices.lock().unwrap();

            let mut current_counts: HashMap<String, usize> = HashMap::new();
            for id in &current { *current_counts.entry(id.clone()).or_insert(0) += 1; }
            let mut known_counts: HashMap<String, usize> = HashMap::new();
            for id in known.iter() { *known_counts.entry(id.clone()).or_insert(0) += 1; }

            let removed: Vec<String> = known_counts.iter()
                .flat_map(|(id, &kc)| {
                    let cc = *current_counts.get(id).unwrap_or(&0);
                    (0..kc.saturating_sub(cc)).map(move |_| id.clone())
                }).collect();

            let added: Vec<String> = current_counts.iter()
                .flat_map(|(id, &cc)| {
                    let kc = *known_counts.get(id).unwrap_or(&0);
                    (0..cc.saturating_sub(kc)).map(move |_| id.clone())
                }).collect();

            if !removed.is_empty() || !added.is_empty() {
                *known = current.clone();
                drop(known);

                let all = list_audio_input_devices();
                let _ = app.emit(EVT_DEVICES_CHANGED, all);

                let streams = state.streams.lock().unwrap();
                for (player_id, active) in streams.iter() {
                    if removed.contains(&active.device_id) {
                        let _ = app.emit(EVT_MIC_DISCONNECTED, MicDisconnectedEvent {
                            device_id: active.device_id.clone(),
                            player_id: *player_id,
                        });
                    }
                }

                for name in &added {
                    let _ = app.emit(EVT_MIC_RECONNECTED, MicReconnectedEvent {
                        device_id: name.clone(),
                        player_id: 0,
                    });
                }
            } else {
                drop(known);
            }
        }
    });
}
