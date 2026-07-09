<script lang="ts">
  import { playersStore, type PlayerConfig } from '$lib/stores/players.svelte'
  import Modal from '$components/ui/Modal.svelte'

  let { player, onclose }: { player: PlayerConfig; onclose: () => void } = $props()

  // Resolve device label for display
  let deviceLabel = $state('')
  $effect(() => {
    if (!player.mic) return
    navigator.mediaDevices.enumerateDevices().then(devices => {
      const d = devices.find(d => d.deviceId === player.mic!.deviceId)
      deviceLabel = d ? `${d.label} (${player.mic!.channel})` : player.mic!.channel
    }).catch(() => {})
  })

  // ── State ──────────────────────────────────────────────────────────────────
  type Phase = 'idle' | 'ready' | 'measuring' | 'done' | 'error'
  let phase = $state<Phase>('idle')
  let countdown = $state(0)         // seconds remaining in get-ready countdown
  let trialResults = $state<number[]>([])
  let detectedMs = $state<number | null>(null)
  let manualMs = $state(player.micDelayMs ?? 40)
  let errorMsg = $state('')

  // ── Audio context (created on demand) ─────────────────────────────────────
  let micRms = $state(0)  // live level for meter
  let meterRaf = 0

  // ── Audio context (created on demand) ─────────────────────────────────────
  let audioCtx: AudioContext | null = null
  let mediaStream: MediaStream | null = null
  let analyser: AnalyserNode | null = null
  let measureRaf = 0
  let countdownTimer = 0

  function startMeter() {
    const tick = () => {
      if (!analyser) return
      const buf = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteTimeDomainData(buf)
      micRms = calcRms(buf)
      meterRaf = requestAnimationFrame(tick)
    }
    meterRaf = requestAnimationFrame(tick)
  }

  const TRIALS       = 5
  const BEEP_FREQ    = 1000   // Hz
  const BEEP_DURATION = 0.05 // 50ms beep — more detectable
  const DETECT_WINDOW = 2000  // ms to listen for echo after beep
  const AMBIENT_SAMPLES = 20  // frames to sample before beep
  const THRESHOLD_MULT = 3    // spike = ambient * this

  async function startTest() {
    errorMsg = ''
    trialResults = []
    detectedMs = null
    phase = 'ready'
    countdown = 3

    // Open mic stream during countdown so meter is live
    try {
      audioCtx = new AudioContext()
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: {
        deviceId: player.mic?.deviceId ? { exact: player.mic.deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      }})
      console.log('[latency] mic stream opened, device:', player.mic?.deviceId)
      const source = audioCtx.createMediaStreamSource(mediaStream)
      analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      startMeter()
    } catch (e) {
      errorMsg = `Mic error: ${(e as Error).message}`
      phase = 'error'
      return
    }

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
      // mic/analyser already opened in startTest()
      for (let t = 0; t < TRIALS; t++) {
        const ms = await runOneTrial()
        console.log(`[latency] trial ${t + 1}: ${ms !== null ? ms + 'ms' : 'no echo'}`)
        if (ms !== null) trialResults = [...trialResults, ms]
        await sleep(400)  // gap between trials
      }

      cleanup()

      if (trialResults.length === 0) {
        errorMsg = 'No echo detected. Hold the mic closer to the speaker.'
        phase = 'error'
        return
      }

      const sorted = [...trialResults].sort((a, b) => a - b)
      detectedMs = sorted[Math.floor(sorted.length / 2)]
      console.log(`[latency] results: ${trialResults.join(', ')}ms → median: ${detectedMs}ms`)
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
          const threshold = Math.max(0.005, ambientRms * THRESHOLD_MULT)
          console.log(`[latency] ambient=${ambientRms.toFixed(4)} threshold=${threshold.toFixed(4)}`)

          // 2. Play beep and listen immediately (echo arrives during/after beep)
          const wallStart = performance.now()
          playBeep(audioCtx!, BEEP_FREQ, BEEP_DURATION)

          // 3. Listen from beep start, ignore first 10ms (direct pickup)
          const deadline = performance.now() + DETECT_WINDOW
          let detected = false

          const listen = () => {
            if (detected || performance.now() > deadline) {
              if (!detected) resolve(null)
              return
            }
            analyser!.getByteTimeDomainData(buf)
            const rms = calcRms(buf)
            if (rms > threshold) {
              const elapsed = performance.now() - wallStart
              console.log(`[latency] spike rms=${rms.toFixed(4)} at ${elapsed.toFixed(0)}ms`)
              detected = true
              resolve(Math.round(elapsed))
              return
            }
            measureRaf = requestAnimationFrame(listen)
          }
          // Wait 10ms to avoid detecting the direct sound of the speaker
          setTimeout(() => { measureRaf = requestAnimationFrame(listen) }, 10)
        }
      }, 16)
    })
  }

  function playBeep(ctx: AudioContext, freq: number, dur: number) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = freq
    gain.gain.setValueAtTime(1.0, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + dur + 0.05)
    console.log(`[latency] beep played — ${freq}Hz ${dur*1000}ms`)
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
    cancelAnimationFrame(meterRaf)
    micRms = 0
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
      {#if deviceLabel}
        <p class="mic-name"><span class="icon">mic</span> {deviceLabel}</p>
      {/if}
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
      <div class="mic-meter">
        <span class="meter-label">Mic input</span>
        <div class="meter-bar"><div class="meter-fill" style="width: {Math.min(100, micRms * 800)}%"></div></div>
        <span class="meter-val">{(micRms * 100).toFixed(1)}%</span>
      </div>
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
      <div class="mic-meter">
        <span class="meter-label">Mic input</span>
        <div class="meter-bar"><div class="meter-fill" style="width: {Math.min(100, micRms * 800)}%"></div></div>
        <span class="meter-val">{(micRms * 100).toFixed(1)}%</span>
      </div>
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

  .mic-meter { display: flex; align-items: center; gap: var(--space-2); }
  .meter-label { font-size: 0.8rem; white-space: nowrap; min-width: 64px; color: var(--md-sys-color-on-surface-variant); }
  .meter-bar { flex: 1; height: 8px; background: var(--md-sys-color-surface-variant); border-radius: 4px; overflow: hidden; }
  .meter-fill { height: 100%; background: var(--md-sys-color-primary); border-radius: 4px; transition: width 50ms linear; }
  .mic-name { display: flex; align-items: center; gap: 6px; font-size: 0.85rem;
              color: var(--md-sys-color-primary); font-weight: 500; }
  .meter-val { font-size: 0.8rem; min-width: 36px; text-align: right; font-variant-numeric: tabular-nums; }
</style>
