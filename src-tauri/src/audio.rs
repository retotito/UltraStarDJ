use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, Host, SampleFormat, StreamConfig};
use serde::Serialize;
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicU64, Ordering};
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
    pub channels: u16,
    #[serde(rename = "maxChannels")]
    pub max_channels: u16,
}

#[derive(Debug, Clone, Serialize)]
pub struct MicLevelEvent {
    pub player_id: u8,
    pub rms: f32, // 0.0 – 1.0
}

#[derive(Clone, Serialize)]
pub struct MicPcmEvent {
    pub player_id: u8,
    pub samples: Vec<f32>,
    pub sample_rate: u32,
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
pub const EVT_MIC_PCM:   &str = "mic:pcm";
pub const EVT_MIC_DISCONNECTED: &str = "mic:disconnected";
pub const EVT_MIC_RECONNECTED: &str = "mic:reconnected";
pub const EVT_DEVICES_CHANGED: &str = "mic:devices-changed";
pub const EVT_OUTPUT_DEVICES_CHANGED: &str = "audio:output-devices-changed";

// ── Input stream state ────────────────────────────────────────────────────────

struct ActiveStream {
    stream: cpal::Stream, // kept alive; dropped on stop
    device_id: String,
    player_id: u8,
}

impl Drop for ActiveStream {
    fn drop(&mut self) {
        eprintln!("[ActiveStream::drop] player={} device={} — cpal stream being disposed", self.player_id, self.device_id);
    }
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
    /// Per-player mic rings: each active mic writes to its own ring.
    /// Output callback sums all of them so N mics don't flood a shared buffer.
    mic_rings: Arc<Mutex<HashMap<u8, RingBuffer>>>,
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
    /// Mic output mix gain per player: player_id → 0.0–2.0
    /// Arc so input stream closures can hold a reference without copying AudioState
    mic_mix_gains: Arc<Mutex<HashMap<u8, f32>>>,
    /// Mic input gain per player: player_id → 0.0–4.0 (hot-reloadable, no stream restart needed)
    mic_input_gains: Arc<Mutex<HashMap<u8, f32>>>,
    /// Noise gate threshold per player: player_id → 0.0–1.0 (hot-reloadable)
    mic_thresholds: Arc<Mutex<HashMap<u8, f32>>>,
    /// Snapshot of input device names for hot-plug detection
    known_devices: Mutex<Vec<String>>,
    /// Snapshot of output device names for hot-plug detection
    known_output_devices: Mutex<Vec<String>>,
}

unsafe impl Sync for AudioState {}

impl AudioState {
    pub fn new() -> Self {
        let host = cpal::default_host();
        let known = device_ids(&host);
        let known_out = enumerate_output_devices(&host).into_iter().map(|(id, _)| id).collect();
        AudioState {
            streams: Mutex::new(HashMap::new()),
            output_channels: Mutex::new(HashMap::new()),
            mic_mix_gains: Arc::new(Mutex::new(HashMap::new())),
            mic_input_gains: Arc::new(Mutex::new(HashMap::new())),
            mic_thresholds: Arc::new(Mutex::new(HashMap::new())),
            known_devices: Mutex::new(known),
            known_output_devices: Mutex::new(known_out),
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
/// Only treats a trailing `#N` as a dedup index if N ≤ 99 (single/double digit).
/// This avoids misinterpreting serial numbers like "Wireless Mic #011069638".
fn parse_device_id(id: &str) -> (&str, usize) {
    if let Some(pos) = id.rfind('#') {
        let suffix = &id[pos + 1..];
        if let Ok(n) = suffix.parse::<usize>() {
            if n >= 2 && n <= 99 {
                return (&id[..pos], n);
            }
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

/// Soft saturation — smoothly limits signal to (-1, 1) without hard clipping.
/// Uses x / (1 + |x|) which is gentle at low levels, never exceeds ±1.
#[inline]
fn soft_saturate(x: f32) -> f32 {
    x / (1.0 + x.abs())
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
    threshold: f32,   // noise gate: 0.0–1.0, samples below this = silence
    input_gain: f32,  // pre-gain multiplier: 0.0–2.0, applied before threshold
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

    // Shared gain map so set_mic_mix_gain can update gain without restarting the stream
    let gains: Arc<Mutex<HashMap<u8, f32>>> = Arc::clone(&state.mic_mix_gains);
    // Shared input gain map so set_mic_input_gain can update without restarting the stream
    let input_gains: Arc<Mutex<HashMap<u8, f32>>> = Arc::clone(&state.mic_input_gains);
    // Seed initial input gain from the value passed at stream creation
    input_gains.lock().unwrap().insert(player_id, input_gain);
    // Shared threshold map so set_mic_threshold can update without restarting the stream
    let thresholds: Arc<Mutex<HashMap<u8, f32>>> = Arc::clone(&state.mic_thresholds);
    // Seed initial threshold from the value passed at stream creation
    thresholds.lock().unwrap().insert(player_id, threshold);
    // Prefer "mic-mix" channel (dedicated for mic→speaker routing), fall back to "game"
    // Create a dedicated per-player ring inside the mic-mix (or game) output channel.
    // The output callback sums all player rings, so N mics don't flood a shared buffer.
    let (game_ring, out_sample_rate): (Option<RingBuffer>, u32) = {
        let channels = state.output_channels.lock().unwrap();
        let ch = channels.get("mic-mix").or_else(|| channels.get("game"));
        if let Some(ch) = ch {
            let player_ring: RingBuffer = Arc::new(Mutex::new(VecDeque::with_capacity(RING_BUFFER_CAPACITY)));
            ch.mic_rings.lock().unwrap().insert(player_id, player_ring.clone());
            (Some(player_ring), ch.sample_rate)
        } else {
            (None, sample_rate.0)
        }
    };
    let in_sample_rate = sample_rate.0;
    let call_count = Arc::new(AtomicU64::new(0));

    eprintln!("[mic-monitor] player={player_id} in_rate={in_sample_rate} out_rate={out_sample_rate} \
               ring_found={} ch_idx={ch_index} threshold={threshold:.3} input_gain={input_gain:.2}", game_ring.is_some());

    let stream = match default_config.sample_format() {
        SampleFormat::F32 => build_input_stream_f32(&device, &config, total_channels, ch_index, player_id, app.clone(), gains, input_gains, thresholds.clone(), game_ring, in_sample_rate, out_sample_rate, call_count),
        SampleFormat::I16 => build_input_stream_i16(&device, &config, total_channels, ch_index, player_id, app.clone(), gains, input_gains, thresholds.clone(), game_ring, in_sample_rate, out_sample_rate, call_count),
        SampleFormat::U16 => build_input_stream_u16(&device, &config, total_channels, ch_index, player_id, app.clone(), gains, input_gains, thresholds, game_ring, in_sample_rate, out_sample_rate, call_count),
        _ => Err("Unsupported sample format".to_string()),
    }?;

    stream.play().map_err(|e| e.to_string())?;

    let mut streams = state.streams.lock().unwrap();
    streams.remove(&player_id);
    streams.insert(player_id, ActiveStream { stream, device_id, player_id });
    Ok(())
}

#[tauri::command]
pub fn stop_mic_monitor(
    state: tauri::State<Arc<AudioState>>,
    player_id: u8,
) -> Result<(), String> {
    // Remove from map while holding the lock, but pause + drop the stream AFTER
    // releasing the lock — pausing before drop ensures CoreAudio fully releases
    // the mic input device and dismisses the macOS privacy indicator.
    let removed = {
        let mut streams = state.streams.lock().unwrap();
        let removed = streams.remove(&player_id);
        eprintln!("[stop_mic_monitor] player={player_id} stream_removed={} remaining={}", removed.is_some(), streams.len());
        removed
    }; // mutex released here
    // Pause before drop: tells CoreAudio to stop the AudioUnit before we dispose it.
    if let Some(ref active) = removed {
        let _ = active.stream.pause();
        eprintln!("[stop_mic_monitor] player={player_id} stream paused");
    }
    eprintln!("[stop_mic_monitor] player={player_id} dropping stream now…");
    drop(removed); // cpal stream disposed after pause + lock release
    eprintln!("[stop_mic_monitor] player={player_id} stream dropped ✓");
    // Remove the player's dedicated ring from all output channels
    let channels = state.output_channels.lock().unwrap();
    for ch in channels.values() {
        ch.mic_rings.lock().unwrap().remove(&player_id);
    }
    Ok(())
}

#[tauri::command]
pub fn debug_open_streams(state: tauri::State<Arc<AudioState>>) -> Vec<String> {
    let streams = state.streams.lock().unwrap();
    streams.iter()
        .map(|(id, s)| format!("player={id} device={}", s.device_id))
        .collect()
}

/// Set the output mix gain for a player's mic (0.0 = muted, 1.0 = unity, 2.0 = boost).
/// Takes effect immediately in the running input stream without restart.
#[tauri::command]
pub fn set_mic_mix_gain(
    state: tauri::State<Arc<AudioState>>,
    player_id: u8,
    gain: f32,
) -> Result<(), String> {
    state.mic_mix_gains.lock().unwrap().insert(player_id, gain.clamp(0.0, 4.0));
    Ok(())
}

#[tauri::command]
pub fn set_mic_input_gain(
    state: tauri::State<Arc<AudioState>>,
    player_id: u8,
    gain: f32,
) -> Result<(), String> {
    state.mic_input_gains.lock().unwrap().insert(player_id, gain.clamp(0.0, 4.0));
    Ok(())
}

#[tauri::command]
pub fn set_mic_threshold(
    state: tauri::State<Arc<AudioState>>,
    player_id: u8,
    threshold: f32,
) -> Result<(), String> {
    state.mic_thresholds.lock().unwrap().insert(player_id, threshold.clamp(0.0, 1.0));
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
            let config = d.default_output_config().ok()?;
            let max_channels = d.supported_output_configs().ok()
                .map(|cfgs| cfgs.map(|c| c.channels()).max().unwrap_or(config.channels()))
                .unwrap_or(config.channels());
            Some(AudioOutputDevice { name: id.clone(), id, channels: config.channels(), max_channels })
        })
        .collect()
}

/// Return the name of the current system default output device.
#[tauri::command]
pub fn get_default_output_device_name() -> Option<String> {
    host().default_output_device()?.name().ok()
}

/// Open (or reopen) an output channel on the given device.
/// channel: "game" | "preview"
/// device_id: device unique ID from list_audio_output_devices, or "" for system default.
/// js_sample_rate: the AudioContext sample rate on the JS side (typically 44100 or 48000).
/// js_channels: number of channels the JS side will send (1 or 2).
/// channel_offset: first output channel index (0 = ch1-2, 2 = ch3-4, etc.).
#[tauri::command]
pub fn open_output_channel(
    state: tauri::State<Arc<AudioState>>,
    channel: String,
    device_id: String,
    js_sample_rate: u32,
    js_channels: u16,
    channel_offset: Option<u16>,
) -> Result<(), String> {
    let channel_offset = channel_offset.unwrap_or(0) as usize;
    let host = host();

    let device = if device_id.is_empty() {
        host.default_output_device()
            .ok_or("No default output device found")?
    } else {
        find_output_device(&host, &device_id)
            .ok_or_else(|| format!("Output device '{}' not found", device_id))?
    };

    let default_config = device.default_output_config().map_err(|e| e.to_string())?;

    // If a channel offset is requested, open the stream with enough channels to reach that offset.
    // E.g. offset=2 → need at least 4 channels (ch3-4). Use default sample rate.
    let needed_channels = if channel_offset > 0 { (channel_offset + 2) as u16 } else { default_config.channels() };
    let out_channels = needed_channels.max(default_config.channels());

    let config = StreamConfig {
        channels: out_channels,
        sample_rate: default_config.sample_rate(),
        buffer_size: cpal::BufferSize::Default,
    };

    let ring: RingBuffer = Arc::new(Mutex::new(VecDeque::with_capacity(RING_BUFFER_CAPACITY)));
    let ring_clone = ring.clone();
    let mic_rings: Arc<Mutex<HashMap<u8, RingBuffer>>> = Arc::new(Mutex::new(HashMap::new()));
    let mic_rings_clone = mic_rings.clone();
    let out_ch = out_channels as usize;

    let stream = device
        .build_output_stream(
            &config,
            move |output: &mut [f32], _| {
                let mut main_buf = ring_clone.lock().unwrap();
                let player_map = mic_rings_clone.lock().unwrap();
                let frame_count = output.len() / out_ch;
                for frame_idx in 0..frame_count {
                    // Sum mic contributions for this frame (each ring holds stereo L+R pairs)
                    let mut mic_l = 0.0f32;
                    let mut mic_r = 0.0f32;
                    for player_ring in player_map.values() {
                        let mut pbuf = player_ring.lock().unwrap();
                        mic_l += pbuf.pop_front().unwrap_or(0.0);
                        mic_r += pbuf.pop_front().unwrap_or(0.0);
                    }
                    let out_frame = &mut output[frame_idx * out_ch..(frame_idx + 1) * out_ch];
                    // Zero all channels, then write to the selected offset pair
                    out_frame.fill(0.0);
                    let main_l = main_buf.pop_front().unwrap_or(0.0);
                    let main_r = main_buf.pop_front().unwrap_or(main_l);
                    if channel_offset + 1 < out_ch {
                        out_frame[channel_offset]     = (main_l + mic_l).clamp(-1.0, 1.0);
                        out_frame[channel_offset + 1] = (main_r + mic_r).clamp(-1.0, 1.0);
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
        mic_rings,
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

fn route_to_output(mono: &[f32], gain: f32, ring: &Option<RingBuffer>, in_rate: u32, out_rate: u32, call_count: &Arc<AtomicU64>) {
    let Some(ring) = ring else { return };
    if gain == 0.0 { return }

    // Resample first (outside the lock)
    let resampled: Vec<f32>;
    let samples: &[f32] = if in_rate == out_rate {
        mono
    } else {
        let ratio = in_rate as f64 / out_rate as f64;
        let out_len = (mono.len() as f64 / ratio).ceil() as usize;
        resampled = (0..out_len).map(|i| {
            let src_pos = i as f64 * ratio;
            let src_idx = src_pos as usize;
            let frac = (src_pos - src_idx as f64) as f32;
            let s0 = mono.get(src_idx).copied().unwrap_or(0.0);
            let s1 = mono.get(src_idx + 1).copied().unwrap_or(s0);
            s0 + (s1 - s0) * frac
        }).collect();
        &resampled
    };

    let mut buf = ring.lock().unwrap();

    // Push all new samples as stereo
    for &s in samples {
        let out = (s * gain).clamp(-1.0, 1.0);
        buf.push_back(out); // L
        buf.push_back(out); // R
    }
    // Reduce ring to ~12ms max to minimise monitoring latency (lower = less "roomy" reverb)
    let max_stereo = (out_rate / 80) as usize * 2; // 12ms ceiling
    if buf.len() > max_stereo {
        buf.drain(..2);
    }

    // Log stats every 500 callbacks (~25s) — remove once stable
    let n = call_count.fetch_add(1, Ordering::Relaxed);
    if n == 0 {
        let ms_after = buf.len() as f32 / (out_rate as f32 * 2.0) * 1000.0;
        eprintln!(
            "[mic-route] first callback: in_rate={in_rate} out_rate={out_rate} \
             input_frames={} pushed_stereo={} ring_after={:.1}ms",
            mono.len(), samples.len() * 2, ms_after
        );
    }
}

fn build_input_stream_f32(
    device: &Device, config: &StreamConfig,
    total_ch: usize, ch_idx: usize, player_id: u8, app: AppHandle,
    gains: Arc<Mutex<HashMap<u8, f32>>>,
    input_gains: Arc<Mutex<HashMap<u8, f32>>>,
    thresholds: Arc<Mutex<HashMap<u8, f32>>>,
    game_ring: Option<RingBuffer>, in_rate: u32, out_rate: u32,
    call_count: Arc<AtomicU64>,
) -> Result<cpal::Stream, String> {
    let mut gate_open = false;
    let mut pcm_buf: Vec<f32> = Vec::with_capacity(2048);
    const PCM_CHUNK: usize = 2048;
    device.build_input_stream(
        config,
        move |data: &[f32], _| {
            let ig = *input_gains.lock().unwrap().get(&player_id).unwrap_or(&1.0);
            let thr = *thresholds.lock().unwrap().get(&player_id).unwrap_or(&0.0);
            let mono: Vec<f32> = data.chunks(total_ch)
                .filter_map(|frame| frame.get(ch_idx).map(|&s| soft_saturate(s * ig))).collect();
            pcm_buf.extend_from_slice(&mono);
            if pcm_buf.len() >= PCM_CHUNK {
                let chunk: Vec<f32> = pcm_buf.drain(..PCM_CHUNK).collect();
                let _ = app.emit(EVT_MIC_PCM, MicPcmEvent { player_id, samples: chunk, sample_rate: in_rate });
            }
            let level = rms(&mono);
            let above = level >= thr || (gate_open && level >= thr * 0.5);
            gate_open = above;
            let gain = *gains.lock().unwrap().get(&player_id).unwrap_or(&1.0);
            if above {
                route_to_output(&mono, gain, &game_ring, in_rate, out_rate, &call_count);
                let _ = app.emit(EVT_MIC_LEVEL, MicLevelEvent { player_id, rms: level });
            } else {
                let _ = app.emit(EVT_MIC_LEVEL, MicLevelEvent { player_id, rms: 0.0 });
            }
        },
        move |_err| {}, None,
    ).map_err(|e| e.to_string())
}

fn build_input_stream_i16(
    device: &Device, config: &StreamConfig,
    total_ch: usize, ch_idx: usize, player_id: u8, app: AppHandle,
    gains: Arc<Mutex<HashMap<u8, f32>>>,
    input_gains: Arc<Mutex<HashMap<u8, f32>>>,
    thresholds: Arc<Mutex<HashMap<u8, f32>>>,
    game_ring: Option<RingBuffer>, in_rate: u32, out_rate: u32,
    call_count: Arc<AtomicU64>,
) -> Result<cpal::Stream, String> {
    let mut gate_open = false;
    let mut pcm_buf: Vec<f32> = Vec::with_capacity(2048);
    const PCM_CHUNK: usize = 2048;
    device.build_input_stream(
        config,
        move |data: &[i16], _| {
            let ig = *input_gains.lock().unwrap().get(&player_id).unwrap_or(&1.0);
            let thr = *thresholds.lock().unwrap().get(&player_id).unwrap_or(&0.0);
            let mono: Vec<f32> = data.chunks(total_ch)
                .filter_map(|frame| frame.get(ch_idx).map(|&s| soft_saturate(s as f32 / i16::MAX as f32 * ig))).collect();
            pcm_buf.extend_from_slice(&mono);
            if pcm_buf.len() >= PCM_CHUNK {
                let chunk: Vec<f32> = pcm_buf.drain(..PCM_CHUNK).collect();
                let _ = app.emit(EVT_MIC_PCM, MicPcmEvent { player_id, samples: chunk, sample_rate: in_rate });
            }
            let level = rms(&mono);
            let above = level >= thr || (gate_open && level >= thr * 0.5);
            gate_open = above;
            let gain = *gains.lock().unwrap().get(&player_id).unwrap_or(&1.0);
            if above {
                route_to_output(&mono, gain, &game_ring, in_rate, out_rate, &call_count);
                let _ = app.emit(EVT_MIC_LEVEL, MicLevelEvent { player_id, rms: level });
            } else {
                let _ = app.emit(EVT_MIC_LEVEL, MicLevelEvent { player_id, rms: 0.0 });
            }
        },
        move |_err| {}, None,
    ).map_err(|e| e.to_string())
}

fn build_input_stream_u16(
    device: &Device, config: &StreamConfig,
    total_ch: usize, ch_idx: usize, player_id: u8, app: AppHandle,
    gains: Arc<Mutex<HashMap<u8, f32>>>,
    input_gains: Arc<Mutex<HashMap<u8, f32>>>,
    thresholds: Arc<Mutex<HashMap<u8, f32>>>,
    game_ring: Option<RingBuffer>, in_rate: u32, out_rate: u32,
    call_count: Arc<AtomicU64>,
) -> Result<cpal::Stream, String> {
    let mut gate_open = false;
    let mut pcm_buf: Vec<f32> = Vec::with_capacity(2048);
    const PCM_CHUNK: usize = 2048;
    device.build_input_stream(
        config,
        move |data: &[u16], _| {
            let ig = *input_gains.lock().unwrap().get(&player_id).unwrap_or(&1.0);
            let thr = *thresholds.lock().unwrap().get(&player_id).unwrap_or(&0.0);
            let mono: Vec<f32> = data.chunks(total_ch)
                .filter_map(|frame| frame.get(ch_idx).map(|&s| soft_saturate((s as f32 - 32768.0) / 32768.0 * ig))).collect();
            pcm_buf.extend_from_slice(&mono);
            if pcm_buf.len() >= PCM_CHUNK {
                let chunk: Vec<f32> = pcm_buf.drain(..PCM_CHUNK).collect();
                let _ = app.emit(EVT_MIC_PCM, MicPcmEvent { player_id, samples: chunk, sample_rate: in_rate });
            }
            let level = rms(&mono);
            let above = level >= thr || (gate_open && level >= thr * 0.5);
            gate_open = above;
            let gain = *gains.lock().unwrap().get(&player_id).unwrap_or(&1.0);
            if above {
                route_to_output(&mono, gain, &game_ring, in_rate, out_rate, &call_count);
                let _ = app.emit(EVT_MIC_LEVEL, MicLevelEvent { player_id, rms: level });
            } else {
                let _ = app.emit(EVT_MIC_LEVEL, MicLevelEvent { player_id, rms: 0.0 });
            }
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

                // Also re-check output devices
                let current_out: Vec<String> = enumerate_output_devices(&host).into_iter().map(|(id, _)| id).collect();
                let mut known_out = state.known_output_devices.lock().unwrap();
                if current_out != *known_out {
                    *known_out = current_out;
                    drop(known_out);
                    let _ = app.emit(EVT_OUTPUT_DEVICES_CHANGED, ());
                } else {
                    drop(known_out);
                }

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
