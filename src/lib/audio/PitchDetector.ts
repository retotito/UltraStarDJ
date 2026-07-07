/**
 * PitchDetector — one instance per active player mic.
 *
 * Pipeline:
 *   getUserMedia(deviceId) → AudioContext → AnalyserNode
 *   → getFloatTimeDomainData → pitchy (YIN) → frequency → MIDI note
 *   → PitchRingBuffer (median smoothing)
 */

import { PitchDetector as Pitchy } from 'pitchy'
import { PitchRingBuffer } from './PitchRingBuffer'

const CLARITY_THRESHOLD = 0.9
const ANALYSER_SIZE     = 2048
const PEAK_CLIP_LIMIT   = 0.95   // reject if signal is clipping

export interface PitchSample {
  midiNote:   number   // -1 = no pitch
  frequency:  number   // Hz, 0 = no pitch
  clarity:    number   // 0–1
}

export class PitchDetector {
  private ctx:       AudioContext | null = null
  private source:    MediaStreamAudioSourceNode | null = null
  private gainNode:  GainNode | null = null
  private analyser:  AnalyserNode | null = null
  private stream:    MediaStream | null = null
  private pitchy:    Pitchy<Float32Array> | null = null
  private timeBuf:   Float32Array = new Float32Array(ANALYSER_SIZE)
  private ring:      PitchRingBuffer
  private threshold: number
  private inputGain: number

  readonly playerId: number

  constructor(playerId: number, threshold = 0.1, inputGain = 1.0, ringSize = 5) {
    this.playerId  = playerId
    this.threshold = threshold
    this.inputGain = inputGain
    this.ring = new PitchRingBuffer(ringSize)
  }

  async start(deviceId: string): Promise<void> {
    await this.stop()

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: deviceId },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      }
    })

    this.ctx      = new AudioContext()
    this.source   = this.ctx.createMediaStreamSource(this.stream)
    this.gainNode = this.ctx.createGain()
    this.gainNode.gain.value = this.inputGain
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = ANALYSER_SIZE
    this.source.connect(this.gainNode)
    this.gainNode.connect(this.analyser)

    this.pitchy  = Pitchy.forFloat32Array(ANALYSER_SIZE)
    this.timeBuf = new Float32Array(ANALYSER_SIZE)
    this.ring.reset()
  }

  async stop(): Promise<void> {
    this.ring.reset()
    this.pitchy = null
    this.analyser?.disconnect()
    this.analyser = null
    this.gainNode?.disconnect()
    this.gainNode = null
    this.source?.disconnect()
    this.source = null
    await this.ctx?.close()
    this.ctx = null
    this.stream?.getTracks().forEach(t => t.stop())
    this.stream = null
  }

  /** Call once per animation frame during playback. */
  sample(): PitchSample {
    if (!this.analyser || !this.pitchy) return { midiNote: -1, frequency: 0, clarity: 0 }

    this.analyser.getFloatTimeDomainData(this.timeBuf)

    // Noise gate — reject samples below threshold (silence / background noise)
    let peak = 0
    for (let i = 0; i < this.timeBuf.length; i++) {
      const abs = Math.abs(this.timeBuf[i])
      if (abs > peak) peak = abs
    }
    if (peak < this.threshold) {
      this.ring.push(-1)
      return { midiNote: -1, frequency: 0, clarity: 0 }
    }

    // Reject clipping signal — peak amplitude too close to ±1
    if (peak >= PEAK_CLIP_LIMIT) {
      this.ring.push(-1)
      return { midiNote: -1, frequency: 0, clarity: 0 }
    }

    const [frequency, clarity] = this.pitchy.findPitch(this.timeBuf, this.ctx!.sampleRate)

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
