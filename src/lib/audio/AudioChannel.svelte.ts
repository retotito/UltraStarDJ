/**
 * AudioChannel — wraps one Web Audio output path.
 *
 * Graph:
 *   HTMLMediaElement / MediaStream
 *     → MediaElementSource / MediaStreamSource
 *     → GainNode          (volume control)
 *     → AnalyserNode      (level metering)
 *     → AudioWorkletNode  (PCM capture → Rust cpal on selected device)
 *     → ctx.destination   (still plays through default output on macOS;
 *                          on macOS routing is handled by Rust cpal)
 *
 * On Windows: setSinkId is called on the source element instead (no cpal needed).
 * On macOS:   cpal stream on selected device receives the PCM via IPC.
 */

import { invoke } from '@tauri-apps/api/core'
import { storageKey } from '$lib/stores/storageKey'

export type ChannelName = 'game' | 'preview'

const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

// setSinkId works on Windows/Chromium with browser mediaDevices IDs.
// On macOS/Tauri (WKWebView) setSinkId exists but only accepts enumerateDevices() IDs,
// not cpal device names — so we always use the cpal worklet path on Tauri.
const SUPPORTS_SINK_ID = !IS_TAURI &&
  typeof HTMLMediaElement !== 'undefined' &&
  'setSinkId' in HTMLMediaElement.prototype

export class AudioChannel {
  readonly name: ChannelName

  private ctx: AudioContext | null = null
  private pendingClose: Promise<void> | null = null
  private gainNode: GainNode | null = null
  private systemGainNode: GainNode | null = null  // muted when cpal device is active
  private analyserNode: AnalyserNode | null = null
  private workletNode: AudioWorkletNode | null = null
  private sourceNode: MediaElementAudioSourceNode | MediaStreamAudioSourceNode | null = null
  private analyserData: Uint8Array | null = null
  private rafId: number | null = null

  // Reactive state (read by HorizontalFader)
  gain = $state(1.0)
  level = $state(0.0)
  deviceId = $state<string | null>(null)
  channelOffset = $state(0)  // 0 = ch1-2, 2 = ch3-4, 4 = ch5-6, etc.

  constructor(name: ChannelName) {
    this.name = name
    this._loadPersistedDevice()
  }

  private _loadPersistedDevice() {
    try {
      const raw = localStorage.getItem(storageKey(`audio-channel:${this.name}:device`))
      if (raw) { const d = JSON.parse(raw); this.deviceId = d.deviceId ?? null; this.channelOffset = d.channelOffset ?? 0 }
    } catch {}
  }

  private _savePersistedDevice() {
    try {
      localStorage.setItem(storageKey(`audio-channel:${this.name}:device`), JSON.stringify({ deviceId: this.deviceId, channelOffset: this.channelOffset }))
    } catch {}
  }

  /** Connect an <audio> element to this channel. Call once on mount. */
  async connectElement(el: HTMLMediaElement): Promise<void> {
    const hadCtx = !!this.ctx
    console.log(`[AudioChannel:${this.name}] connectElement — hadCtx=${hadCtx} pendingClose=${!!this.pendingClose}`)
    // Always await any in-flight ctx.close() so the element is fully released
    if (this.pendingClose) await this.pendingClose
    await this.disconnectAsync()

    this.ctx = new AudioContext()
    if (this.ctx.state === 'suspended') await this.ctx.resume()

    this.gainNode = this.ctx.createGain()
    this.analyserNode = this.ctx.createAnalyser()
    this.analyserNode.fftSize = 256
    this.analyserData = new Uint8Array(this.analyserNode.frequencyBinCount)

    // systemGainNode gates the ctx.destination path.
    // Gain = 1 when using system default; gain = 0 when cpal routes to a specific device.
    this.systemGainNode = this.ctx.createGain()
    this.systemGainNode.gain.value = this.deviceId ? 0 : 1

    // Start silent to avoid the connection pop, ramp to target gain over 30ms
    this.gainNode.gain.setValueAtTime(0, this.ctx.currentTime)
    this.gainNode.gain.linearRampToValueAtTime(this.gain, this.ctx.currentTime + 0.03)

    try {
      this.sourceNode = this.ctx.createMediaElementSource(el)
    } catch (err) {
      console.error(`[AudioChannel:${this.name}] createMediaElementSource failed:`, err)
      return
    }
    this.sourceNode.connect(this.gainNode)
    this.gainNode.connect(this.analyserNode)

    this._startMeterLoop()

    if (SUPPORTS_SINK_ID) {
      this.analyserNode.connect(this.systemGainNode!)
      this.systemGainNode!.connect(this.ctx.destination)
      if (this.deviceId) await this._applySinkId(el, this.deviceId)
    } else {
      this.analyserNode.connect(this.systemGainNode!)
      this.systemGainNode!.connect(this.ctx.destination)
      if (this.deviceId) await this._connectWorklet()
    }
  }

  /** Disconnect and clean up. Call on component destroy. */
  disconnect(): void {
    this.workletNode?.port.postMessage('stop')
    this.workletNode?.disconnect()
    this.workletNode = null
    this.analyserNode?.disconnect()
    this.systemGainNode?.disconnect()
    this.gainNode?.disconnect()
    this.sourceNode?.disconnect()
    this.sourceNode = null
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    this.rafId = null
    const ctx = this.ctx
    this.ctx = null
    if (ctx) this.pendingClose = ctx.close().catch(() => {}).then(() => { this.pendingClose = null })
    invoke('close_output_channel', { channel: this.name }).catch(() => {})
  }

  /** Async version — awaits ctx.close() so the audio element is fully released before reconnecting. */
  async disconnectAsync(): Promise<void> {
    this.workletNode?.port.postMessage('stop')
    this.workletNode?.disconnect()
    this.workletNode = null
    this.analyserNode?.disconnect()
    this.gainNode?.disconnect()
    this.sourceNode?.disconnect()
    this.sourceNode = null
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    this.rafId = null
    const ctx = this.ctx
    this.ctx = null
    if (ctx) { this.pendingClose = null; await ctx.close().catch(() => {}) }
    invoke('close_output_channel', { channel: this.name }).catch(() => {})
  }

  /** Set gain 0–1. Updates GainNode immediately. */
  setGain(value: number): void {
    this.gain = Math.max(0, Math.min(1, value))
    if (this.gainNode) this.gainNode.gain.value = this.gain
  }

  /** Call after device list refresh — resets to system default if selected device is gone. */
  async resetIfDeviceGone(availableDeviceIds: string[]): Promise<void> {
    if (this.deviceId && !availableDeviceIds.includes(this.deviceId)) {
      console.log(`[AudioChannel:${this.name}] device gone — resetting to system default`)
      await this.setDevice(null, 0)
    }
  }

  /** Route to a specific output device (by ID from list_audio_output_devices). */
  async setDevice(deviceId: string | null, channelOffset = 0, el?: HTMLMediaElement): Promise<void> {
    console.log(`[AudioChannel:${this.name}] setDevice → ${deviceId ?? 'system default'} offset:${channelOffset} ctx=${!!this.ctx}`)
    this.deviceId = deviceId
    this.channelOffset = channelOffset
    this._savePersistedDevice()

    if (SUPPORTS_SINK_ID && el) {
      await this._applySinkId(el, deviceId ?? '')
      return
    }

    // macOS: toggle system output and open/close cpal channel
    if (!this.ctx || !this.analyserNode) return

    if (deviceId) {
      // Mute system output — cpal will play on the selected device
      console.log(`[AudioChannel:${this.name}] muting system output, opening cpal on: ${deviceId}`)
      this.systemGainNode?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02)
      await this._connectWorklet()
    } else {
      // Back to system default — unmute system output, close cpal stream
      this.systemGainNode?.gain.setTargetAtTime(1, this.ctx.currentTime, 0.02)
      this.workletNode?.port.postMessage('stop')
      this.workletNode?.disconnect()
      this.workletNode = null
      invoke('close_output_channel', { channel: this.name }).catch(() => {})
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private async _connectWorklet(): Promise<void> {
    if (!this.ctx || !this.analyserNode) return

    // Disconnect any existing worklet before creating a new one
    if (this.workletNode) {
      this.workletNode.port.postMessage('stop')
      this.workletNode.disconnect()
      this.workletNode = null
      invoke('close_output_channel', { channel: this.name }).catch(() => {})
    }

    try {
      await this.ctx.audioWorklet.addModule('/pcm-capture-processor.js')
      this.workletNode = new AudioWorkletNode(this.ctx, 'pcm-capture-processor')

      const channelName = this.name
      const sampleRate = this.ctx.sampleRate
      let pcmPushCount = 0

      // Open cpal stream on Rust side
      await this._openCpalChannel(this.deviceId ?? '', this.channelOffset)

      // Main-thread handler: receives PCM chunks from worklet and sends to Rust
      this.workletNode.port.onmessage = (e: MessageEvent) => {
        const samples: Float32Array = e.data.samples
        pcmPushCount++
        if (pcmPushCount <= 3) {
          console.log(`[AudioChannel:${channelName}] push_audio_pcm #${pcmPushCount} samples:${samples.length}`)
        }
        invoke('push_audio_pcm', {
          channel: channelName,
          samples: Array.from(samples),
        }).catch(() => {})
      }

      this.analyserNode.connect(this.workletNode)
      // workletNode sends PCM to Rust/cpal on the selected device.
      // ctx.destination handles the default/fallback output (already connected above).
    } catch (err) {
      console.warn(`[AudioChannel:${this.name}] WorkletNode setup failed, falling back to default output`, err)
      this.analyserNode?.connect(this.ctx.destination)
    }
  }

  private async _openCpalChannel(deviceId: string, channelOffset = 0): Promise<void> {
    if (!this.ctx) return
    try {
      console.log(`[AudioChannel:${this.name}] open_output_channel → deviceId:'${deviceId}' offset:${channelOffset} sampleRate:${this.ctx.sampleRate}`)
      await invoke('open_output_channel', {
        channel: this.name,
        deviceId,
        jsSampleRate: this.ctx.sampleRate,
        jsChannels: 2,
        channelOffset,
      })
    } catch (err) {
      console.warn(`[AudioChannel:${this.name}] open_output_channel failed`, err)
    }
  }

  private async _applySinkId(el: HTMLMediaElement, deviceId: string): Promise<void> {
    try {
      // @ts-ignore — setSinkId not in TS lib yet
      await el.setSinkId(deviceId)
    } catch (err) {
      console.warn(`[AudioChannel:${this.name}] setSinkId failed`, err)
    }
  }

  /** Zero the level meter immediately (e.g. on stop) without disconnecting the audio graph. */
  resetLevel(): void {
    this.level = 0
  }

  private _startMeterLoop(): void {
    const tick = () => {
      if (!this.analyserNode || !this.analyserData) return
      this.analyserNode.getByteFrequencyData(this.analyserData)
      const sum = this.analyserData.reduce((a, b) => a + b, 0)
      this.level = sum / (this.analyserData.length * 255)
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }
}
