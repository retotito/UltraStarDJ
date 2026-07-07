/**
 * dB-linear gain taper: 100% = 0dB, each 10% step ≈ -3dB, 0% = silence.
 * Maps a 0–1 fader position to an audio gain multiplier.
 */
export function gainCurve(v: number): number {
  if (v <= 0) return 0
  return 10 ** (1.5 * (v - 1)) // 0% ≈ -30dB, 100% = 0dB
}
