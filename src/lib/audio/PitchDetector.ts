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

export interface PitchSample {
  midiNote:   number   // -1 = no pitch
  frequency:  number   // Hz, 0 = no pitch
  clarity:    number   // 0–1
}

export class PitchDetector {
  private ctx:      AudioContext | null = null
  private source:   MediaStreamAudioSourceNode | null = null
  private analyser: AnalyserNode | null = null
  private stream:   MediaStream | null = null
  private pitchy:   Pitchy<Float32Array> | null = null
  private timeBuf:  Float32Array = new Float32Array(ANALYSER_SIZE)
  private ring:     PitchRingBuffer

  readonly playerId: number

  constructor(playerId: number, ringSize = 5) {
    this.playerId = playerId
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
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = ANALYSER_SIZE
    this.source.connect(this.analyser)

    this.pitchy  = Pitchy.forFloat32Array(ANALYSER_SIZE)
    this.timeBuf = new Float32Array(ANALYSER_SIZE)
    this.ring.reset()
  }

  async stop(): Promise<void> {
    this.ring.reset()
    this.pitchy = null
    this.analyser?.disconnect()
    this.analyser = null
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
