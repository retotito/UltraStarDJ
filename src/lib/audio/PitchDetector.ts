/**
 * PitchDetector — one instance per active player mic.
 *
 * Pipeline (IPC-based — bypasses WKWebView's single-getUserMedia limitation):
 *   Rust cpal → app.emit("mic:pcm") → ring buffer → pitchy (YIN) → MIDI note
 *   → PitchRingBuffer (median smoothing)
 */

import { PitchDetector as Pitchy } from 'pitchy'
import { PitchRingBuffer } from './PitchRingBuffer'
import { onMicPcm, type MicPcmPayload } from '$lib/ipc/tauri'
import type { UnlistenFn } from '@tauri-apps/api/event'

const CLARITY_THRESHOLD = 0.9
const ANALYSER_SIZE     = 2048
const PCM_BUF_SIZE      = 4096   // ring buffer length (samples)
const PEAK_CLIP_LIMIT   = 0.95   // reject if signal is clipping

export interface PitchSample {
  midiNote:   number   // -1 = no pitch
  frequency:  number   // Hz, 0 = no pitch
  clarity:    number   // 0–1
}

export class PitchDetector {
  private unlisten:   UnlistenFn | null = null
  private pitchy:     Pitchy<Float32Array> | null = null
  private workBuf:    Float32Array = new Float32Array(ANALYSER_SIZE)
  private pcmBuf:     Float32Array = new Float32Array(PCM_BUF_SIZE)
  private pcmWrite    = 0
  private pcmFull     = false
  private sampleRate  = 48000
  private ring:       PitchRingBuffer
  private threshold:  number
  private _silenceLogCount = 0

  readonly playerId: number

  constructor(playerId: number, threshold = 0.1, _inputGain = 1.0, ringSize = 5) {
    this.playerId  = playerId
    this.threshold = threshold
    // inputGain is applied by Rust (soft_saturate * ig) before PCM is emitted
    this.ring = new PitchRingBuffer(ringSize)
  }

  async start(_deviceId: string): Promise<void> {
    await this.stop()

    this.pitchy = Pitchy.forFloat32Array(ANALYSER_SIZE)
    this.ring.reset()
    this._silenceLogCount = 0
    this.pcmWrite = 0
    this.pcmFull  = false

    this.unlisten = await onMicPcm((payload: MicPcmPayload) => {
      if (payload.player_id !== this.playerId) return
      this.sampleRate = payload.sample_rate
      const src = payload.samples
      for (let i = 0; i < src.length; i++) {
        this.pcmBuf[this.pcmWrite] = src[i]
        this.pcmWrite = (this.pcmWrite + 1) % PCM_BUF_SIZE
        if (this.pcmWrite === 0) this.pcmFull = true
      }
    })

    console.log(`[PitchDetector P${this.playerId}] started via IPC mic:pcm`)
  }

  async stop(): Promise<void> {
    this.unlisten?.()
    this.unlisten = null
    this.pitchy   = null
    this.ring.reset()
  }

  /** Call once per animation frame during playback. */
  sample(): PitchSample {
    if (!this.pitchy || (!this.pcmFull && this.pcmWrite < ANALYSER_SIZE)) {
      return { midiNote: -1, frequency: 0, clarity: 0 }
    }

    // Copy the most recent ANALYSER_SIZE samples from the circular buffer
    const start = (this.pcmWrite - ANALYSER_SIZE + PCM_BUF_SIZE) % PCM_BUF_SIZE
    for (let i = 0; i < ANALYSER_SIZE; i++) {
      this.workBuf[i] = this.pcmBuf[(start + i) % PCM_BUF_SIZE]
    }

    // Noise gate
    let peak = 0
    for (let i = 0; i < this.workBuf.length; i++) {
      const abs = Math.abs(this.workBuf[i])
      if (abs > peak) peak = abs
    }
    if (peak < this.threshold) {
      this._silenceLogCount++
      if (this._silenceLogCount % 300 === 1) {
        console.log(`[PitchDetector P${this.playerId}] below threshold: peak=${peak.toFixed(4)} threshold=${this.threshold}`)
      }
      this.ring.push(-1)
      return { midiNote: -1, frequency: 0, clarity: 0 }
    }

    if (peak >= PEAK_CLIP_LIMIT) {
      this.ring.push(-1)
      return { midiNote: -1, frequency: 0, clarity: 0 }
    }

    const [frequency, clarity] = this.pitchy.findPitch(this.workBuf, this.sampleRate)

    if (clarity < CLARITY_THRESHOLD || frequency <= 0) {
      this.ring.push(-1)
      return { midiNote: -1, frequency: 0, clarity }
    }

    const midiNote = 69 + 12 * Math.log2(frequency / 440)
    this.ring.push(Math.round(midiNote))

    const smoothed = Math.round(this.ring.median())
    return { midiNote: smoothed, frequency, clarity }
  }
}
