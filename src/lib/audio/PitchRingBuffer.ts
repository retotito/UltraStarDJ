/**
 * PitchRingBuffer — circular buffer of MIDI note values per player.
 * Uses median smoothing to reject one-off spikes and dropouts.
 */
export class PitchRingBuffer {
  private buf: number[]
  private ptr = 0
  private count = 0

  constructor(private readonly size: number = 5) {
    this.buf = new Array(size).fill(-1)
  }

  push(midiNote: number): void {
    this.buf[this.ptr % this.size] = midiNote
    this.ptr++
    if (this.count < this.size) this.count++
  }

  /** Median of the last N valid (≥0) samples. Returns -1 if none. */
  median(): number {
    const valid = this.buf.slice(0, this.count).filter(v => v >= 0)
    if (valid.length === 0) return -1
    valid.sort((a, b) => a - b)
    const mid = Math.floor(valid.length / 2)
    return valid.length % 2 === 0
      ? (valid[mid - 1] + valid[mid]) / 2
      : valid[mid]
  }

  reset(): void {
    this.buf.fill(-1)
    this.ptr = 0
    this.count = 0
  }
}
