/**
 * Reactive list of audio output devices, fetched from Rust via cpal.
 */

import { invoke } from '@tauri-apps/api/core'

export interface AudioOutputDevice {
  id: string
  name: string
}

let _devices = $state<AudioOutputDevice[]>([])

export const audioOutputDevices = {
  get list() { return _devices },
}

/** Call once on app mount to load the device list. */
export async function loadAudioOutputDevices(): Promise<void> {
  try {
    _devices = await invoke<AudioOutputDevice[]>('list_audio_output_devices')
  } catch (err) {
    console.warn('[audioOutputDevices] failed to load', err)
    _devices = []
  }
}
