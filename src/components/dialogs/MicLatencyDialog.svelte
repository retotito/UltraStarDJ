<script lang="ts">
  import { playersStore, type PlayerConfig } from '$lib/stores/players.svelte'
  import Modal from '$components/ui/Modal.svelte'

  let { player, onclose }: { player: PlayerConfig; onclose: () => void } = $props()

  // ── State ──────────────────────────────────────────────────────────────────
  type Phase = 'idle' | 'ready' | 'measuring' | 'done' | 'error'
  let phase = $state<Phase>('idle')
  let countdown = $state(0)         // seconds remaining in get-ready countdown
  let trialResults = $state<number[]>([])
  let detectedMs = $state<number | null>(null)
  let manualMs = $state(player.micDelayMs ?? 40)
  let errorMsg = $state('')

  // ── Audio context (created on demand) ─────────────────────────────────────
  let audioCtx: AudioContext | null = null
  let mediaStream: MediaStream | null = null
  let analyser: AnalyserNode | null = null
  let measureRaf = 0
  let countdownTimer = 0

  const TRIALS       = 3
  const BEEP_FREQ    = 1000   // Hz
  const BEEP_DURATION = 0.015 // 15ms beep
  const DETECT_WINDOW = 2000  // ms to listen for echo after beep
  const AMBIENT_SAMPLES = 20  // frames to sample before beep
  const THRESHOLD_MULT = 4    // spike = ambient * this

  async function startTest() {
    errorMsg = ''
    trialResults = []
    detectedMs = null
    phase = 'ready'
    countdown = 3

    countdownTimer = setInterval(() => {
      countdown--
      if (countdown <= 0) {
        clearInterval(countdownTimer)
        runTrials()
      }
    }, 1000) as unknown as number
  }

  async function runTrials() {
    phase = 'measuring'
    try {
      audioCtx = new AudioContext()
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: {
        deviceId: player.mic?.deviceId ? { exact: player.mic.deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      }})

      const source = audioCtx.createMediaStreamSource(mediaStream)
      analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)

      for (let t = 0; t < TRIALS; t++) {
        const ms = await runOneTrial()
        if (ms !== null) trialResults = [...trialResults, ms]
        await sleep(300)  // gap between trials
      }

      cleanup()

      if (trialResults.length === 0) {
        errorMsg = 'No echo detected. Hold the mic closer to the speaker.'
        phase = 'error'
        return
      }

      const sorted = [...trialResults].sort((a, b) => a - b)
      detectedMs = sorted[Math.floor(sorted.length / 2)]
      manualMs = detectedMs
      phase = 'done'
    } catch (e) {
      cleanup()
      errorMsg = `Mic error: ${(e as Error).message}`
      phase = 'error'
    }
  }

  function runOneTrial(): Promise<number | null> {
    return new Promise(resolve => {
      if (!audioCtx || !analyser) { resolve(null); return }
      const buf = new Uint8Array(analyser.frequencyBinCount)

      // 1. Sample ambient level
      let ambientSum = 0
      let ambientCount = 0
      const ambientInterval = setInterval(() => {
        analyser!.getByteTimeDomainData(buf)
        const rms = calcRms(buf)
        ambientSum += rms
        ambientCount++
        if (ambientCount >= AMBIENT_SAMPLES) {
          clearInterval(ambientInterval)
          const ambientRms = ambientSum / ambientCount
          const threshold = Math.max(0.01, ambientRms * THRESHOLD_MULT)

          // 2. Play beep
          const tStart = audioCtx!.currentTime
          playBeep(audioCtx!, BEEP_FREQ, BEEP_DURATION)
          const wallStart = performance.now()

          // 3. Listen for spike
          const deadline = performance.now() + DETECT_WINDOW
          let detected = false

          const listen = () => {
            if (detected || performance.now() > deadline) {
              resolve(detected ? null : null)
              return
            }
            analyser!.getByteTimeDomainData(buf)
            const rms = calcRms(buf)
            if (rms > threshold) {
              detected = true
              resolve(Math.round(performance.now() - wallStart))
              return
            }
            measureRaf = requestAnimationFrame(listen)
          }
          // Start listening after the beep ends
          setTimeout(() => {
            measureRaf = requestAnimationFrame(listen)
          }, BEEP_DURATION * 1000 + 10)
        }
      }, 16)
    })
  }

  function playBeep(ctx: AudioContext, freq: number, dur: number) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.8, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + dur + 0.01)
  }

  function calcRms(buf: Uint8Array): number {
    let sum = 0
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128
      sum += v * v
    }
    return Math.sqrt(sum / buf.length)
  }

  function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

  function cleanup() {
    cancelAnimationFrame(measureRaf)
    mediaStream?.getTracks().forEach(t => t.stop())
    audioCtx?.close()
    mediaStream = null; audioCtx = null; analyser = null
  }

  function apply() {
    playersStore.setMicDelayMs(player.id, manualMs)
    onclose()
  }

  function cancel() {
    clearInterval(countdownTimer)
    cancelAnimationFrame(measureRaf)
    cleanup()
    onclose()
  }
</script>

<Modal title="Mic Latency — Player {player.id}" open={true} onclose={cancel}>
  <div class="latency-dialog">

    {#if phase === 'idle'}
      <p class="hint">
        Hold your microphone close to your headphone or speaker output.<br>
        The app will play a short beep and measure how long it takes to reach the mic.
      </p>
      <div class="manual-row">
        <span class="manual-label">Manual: <strong>{manualMs} ms</strong></span>
        <input type="range" min="0" max="500" step="10" bind:value={manualMs} class="delay-slider" />
      </div>
      <div class="actions">
        <button class="btn btn-primary" onclick={startTest} disabled={!player.mic}>
          <span class="icon">play_arrow</span> Start Auto Test
        </button>
        <button class="btn" onclick={apply}>Apply {manualMs} ms</button>
        <button class="btn" onclick={cancel}>Cancel</button>
      </div>
      {#if !player.mic}
        <p class="error-msg">No mic assigned to this player.</p>
      {/if}

    {:else if phase === 'ready'}
      <p class="hint">Get ready — hold the mic to the speaker!</p>
      <div class="countdown-ring">
        <svg viewBox="0 0 64 64" class="ring-svg">
          <circle cx="32" cy="32" r="28" class="ring-bg" />
          <circle cx="32" cy="32" r="28" class="ring-fill"
            stroke-dasharray="{(1 - countdown / 3) * 175.9} 175.9" />
        </svg>
        <span class="countdown-num">{countdown}</span>
      </div>

    {:else if phase === 'measuring'}
      <p class="hint">Measuring… trial {trialResults.length + 1} of {TRIALS}</p>
      <div class="trials-row">
        {#each Array(TRIALS) as _, i}
          <div class="trial-dot" class:done={i < trialResults.length} class:active={i === trialResults.length}>
            {#if i < trialResults.length}
              {trialResults[i]} ms
            {:else}
              —
            {/if}
          </div>
        {/each}
      </div>

    {:else if phase === 'done'}
      <div class="result">
        <span class="result-label">Detected latency</span>
        <span class="result-value">{detectedMs} ms</span>
        <span class="result-sub">Trials: {trialResults.join(' ms, ')} ms</span>
      </div>
      <div class="manual-row">
        <span class="manual-label">Adjust: <strong>{manualMs} ms</strong></span>
        <input type="range" min="0" max="500" step="10" bind:value={manualMs} class="delay-slider" />
      </div>
      <div class="actions">
        <button class="btn btn-primary" onclick={apply}>Apply {manualMs} ms to Player {player.id}</button>
        <button class="btn" onclick={cancel}>Close</button>
      </div>

    {:else if phase === 'error'}
      <p class="error-msg">{errorMsg}</p>
      <div class="manual-row">
        <span class="manual-label">Set manually: <strong>{manualMs} ms</strong></span>
        <input type="range" min="0" max="500" step="10" bind:value={manualMs} class="delay-slider" />
      </div>
      <div class="actions">
        <button class="btn btn-primary" onclick={startTest}>Retry</button>
        <button class="btn" onclick={apply}>Apply {manualMs} ms</button>
        <button class="btn" onclick={cancel}>Cancel</button>
      </div>
    {/if}

  </div>
</Modal>

<style>
  .latency-dialog { display: flex; flex-direction: column; gap: var(--space-3); min-width: 320px; }
  .hint { color: var(--md-sys-color-on-surface-variant); font-size: 0.9rem; line-height: 1.5; }
  .manual-row { display: flex; align-items: center; gap: var(--space-2); }
  .manual-label { font-size: 0.85rem; white-space: nowrap; min-width: 120px; }
  .delay-slider { flex: 1; }
  .actions { display: flex; gap: var(--space-2); flex-wrap: wrap; }

  .countdown-ring { position: relative; width: 96px; height: 96px; margin: 0 auto; }
  .ring-svg { width: 100%; height: 100%; transform: rotate(-90deg); }
  .ring-bg  { fill: none; stroke: var(--md-sys-color-surface-variant); stroke-width: 6; }
  .ring-fill { fill: none; stroke: var(--md-sys-color-primary); stroke-width: 6;
               stroke-linecap: round; transition: stroke-dasharray 0.9s linear; }
  .countdown-num { position: absolute; inset: 0; display: flex; align-items: center;
                   justify-content: center; font-size: 2rem; font-weight: 700; }

  .trials-row { display: flex; gap: var(--space-2); justify-content: center; }
  .trial-dot { width: 80px; height: 48px; border-radius: var(--radius-md);
               border: 1px solid var(--md-sys-color-outline);
               display: flex; align-items: center; justify-content: center;
               font-size: 0.85rem; color: var(--md-sys-color-on-surface-variant); }
  .trial-dot.done  { background: var(--md-sys-color-primary-container);
                     color: var(--md-sys-color-on-primary-container); border-color: transparent; }
  .trial-dot.active { border-color: var(--md-sys-color-primary); animation: pulse 0.8s ease-in-out infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

  .result { text-align: center; padding: var(--space-3) 0; }
  .result-label { display: block; font-size: 0.85rem; color: var(--md-sys-color-on-surface-variant); }
  .result-value { display: block; font-size: 2.5rem; font-weight: 800; color: var(--md-sys-color-primary); }
  .result-sub { display: block; font-size: 0.8rem; color: var(--md-sys-color-on-surface-variant); margin-top: var(--space-1); }

  .error-msg { color: var(--md-sys-color-error); font-size: 0.9rem; }
</style>
