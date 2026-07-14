/**
 * Reactive list of audio output devices, fetched from Rust via cpal.
 *
 * Note: navigator.mediaDevices.enumerateDevices() returns no audiooutput
 * devices on macOS WKWebView (Tauri), so cpal is the only source.
 *
 * Known macOS/cpal limitation: Bluetooth devices only appear in the list
 * when they are the system default output. USB devices always appear.
 */

import { invoke } from '@tauri-apps/api/core'

export interface AudioOutputDevice {
  id: string
  name: string
  channels: number
  maxChannels: number
}

// Device name substrings to hide — virtual capture/loopback devices that are
// not useful as playback outputs.
const HIDDEN_DEVICE_PATTERNS = [
  'speaker audio recorder',
  'screen recorder',
  'loopback',
  'blackhole',
]

function isHidden(name: string): boolean {
  const lower = name.toLowerCase()
  return HIDDEN_DEVICE_PATTERNS.some(p => lower.includes(p))
}

let _devices = $state<AudioOutputDevice[]>([])
let _defaultName = $state<string | null>(null)

export const audioOutputDevices = {
  get list() { return _devices },
  get defaultName() { return _defaultName },
}

/** Call once on app mount and again whenever the user refreshes the device list. */
export async function loadAudioOutputDevices(): Promise<void> {
  try {
    const all = await invoke<AudioOutputDevice[]>('list_audio_output_devices')
    console.log('[audioOutputDevices] raw list:', all.map(d => `[${d.channels}ch/max${d.maxChannels}ch] ${d.name}`).join(' | '))
    _devices = all.filter(d => !isHidden(d.name))
    _defaultName = await invoke<string | null>('get_default_output_device_name')
  } catch (err) {
    console.warn('[audioOutputDevices] failed to load', err)
    _devices = []
  }
}
