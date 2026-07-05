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

const SUPPORTS_SINK_ID = typeof HTMLMediaElement !== 'undefined' &&
  'setSinkId' in HTMLMediaElement.prototype

export class AudioChannel {
  readonly name: ChannelName

  private ctx: AudioContext | null = null
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
    this.disconnect()

    this.ctx = new AudioContext()
    this.gainNode = this.ctx.createGain()
    this.analyserNode = this.ctx.createAnalyser()
    this.analyserNode.fftSize = 256
    this.analyserData = new Uint8Array(this.analyserNode.frequencyBinCount)

    this.gainNode.gain.value = this.gain

    this.sourceNode = this.ctx.createMediaElementSource(el)
    this.sourceNode.connect(this.gainNode)
    this.gainNode.connect(this.analyserNode)

    // Start metering loop
    this._startMeterLoop()

    // macOS: set up Rust cpal routing if a device is selected
    if (!SUPPORTS_SINK_ID) {
      await this._connectWorklet()
    } else {
      // Windows: route directly on the element
      this.analyserNode.connect(this.ctx.destination)
      if (this.deviceId) {
        await this._applySinkId(el, this.deviceId)
      }
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
    if (this.ctx) {
      this.ctx.close().catch(() => {})
      this.ctx = null
    }
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

    // macOS: reopen cpal output stream on new device
    if (this.ctx && this.workletNode) {
      await this._openCpalChannel(deviceId ?? '')
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
      // Do NOT connect workletNode → ctx.destination: audio goes to cpal, not default output.
      // Connect analyserNode → destination for monitoring in the same app window (optional).
      // Comment out next line to send audio ONLY to cpal (selected device), not default:
      // this.analyserNode.connect(this.ctx.destination)
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
