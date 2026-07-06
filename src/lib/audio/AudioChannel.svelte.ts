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
  private analyserNode: AnalyserNode | null = null
  private workletNode: AudioWorkletNode | null = null
  private sourceNode: MediaElementAudioSourceNode | MediaStreamAudioSourceNode | null = null
  private analyserData: Uint8Array | null = null
  private rafId: number | null = null

  // Reactive state (read by HorizontalFader)
  gain = $state(1.0)
  level = $state(0.0)
  deviceId = $state<string | null>(null)

  constructor(name: ChannelName) {
    this.name = name
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
      this.analyserNode.connect(this.ctx.destination)
      if (this.deviceId) await this._applySinkId(el, this.deviceId)
    } else {
      this.analyserNode.connect(this.ctx.destination)
      if (this.deviceId) await this._connectWorklet()
    }
  }

  /** Disconnect and clean up. Call on component destroy. */
  disconnect(): void {
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

  /** Route to a specific output device (by ID from list_audio_output_devices). */
  async setDevice(deviceId: string | null, el?: HTMLMediaElement): Promise<void> {
    this.deviceId = deviceId

    if (SUPPORTS_SINK_ID && el) {
      await this._applySinkId(el, deviceId ?? '')
      return
    }

    // macOS: open/close cpal channel based on whether a specific device is selected
    if (!this.ctx || !this.analyserNode) return
    if (deviceId) {
      await this._connectWorklet()
    } else {
      // Back to system default — disconnect worklet, use ctx.destination only
      this.workletNode?.port.postMessage('stop')
      this.workletNode?.disconnect()
      this.workletNode = null
      invoke('close_output_channel', { channel: this.name }).catch(() => {})
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private async _connectWorklet(): Promise<void> {
    if (!this.ctx || !this.analyserNode) return

    try {
      await this.ctx.audioWorklet.addModule('/pcm-capture-processor.js')
      this.workletNode = new AudioWorkletNode(this.ctx, 'pcm-capture-processor')

      const channelName = this.name
      const sampleRate = this.ctx.sampleRate

      // Open cpal stream on Rust side
      await this._openCpalChannel(this.deviceId ?? '')

      // Main-thread handler: receives PCM chunks from worklet and sends to Rust
      this.workletNode.port.onmessage = (e: MessageEvent) => {
        const samples: Float32Array = e.data.samples
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

  private async _openCpalChannel(deviceId: string): Promise<void> {
    if (!this.ctx) return
    try {
      await invoke('open_output_channel', {
        channel: this.name,
        deviceId,
        jsSampleRate: this.ctx.sampleRate,
        jsChannels: 2,
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
