/**
 * PCM Capture Processor — AudioWorkletProcessor
 *
 * Captures interleaved stereo f32 PCM from the audio graph and forwards
 * chunks to the main thread via MessagePort.
 *
 * The main thread then calls invoke('push_audio_pcm', { channel, samples })
 * to send the PCM to Rust → cpal output stream on the selected device.
 *
 * Buffer strategy: accumulate CHUNK_SIZE frames before posting to reduce
 * IPC call frequency. At 44100 Hz, 1024 frames ≈ 23ms per call.
 */

const CHUNK_FRAMES = 1024;

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    this._buffer = [];
    this._active = true;

    this.port.onmessage = (e) => {
      if (e.data === 'stop') this._active = false;
    };
  }

  process(inputs) {
    if (!this._active) return false;

    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const L = input[0]; // left channel (or mono)
    const R = input[1] ?? input[0]; // right channel (fallback to mono)

    // Interleave L/R into a flat array
    for (let i = 0; i < L.length; i++) {
      this._buffer.push(L[i], R[i]);
    }

    // Post when we have enough frames (CHUNK_FRAMES * 2 samples for stereo)
    if (this._buffer.length >= CHUNK_FRAMES * 2) {
      const chunk = new Float32Array(this._buffer.splice(0, CHUNK_FRAMES * 2));
      // Transfer the buffer — zero-copy
      this.port.postMessage({ samples: chunk }, [chunk.buffer]);
    }

    return true; // keep processor alive
  }
}

registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
