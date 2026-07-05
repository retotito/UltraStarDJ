/**
 * Audio channel singletons.
 * Import these wherever you need to connect an audio element or read level/gain.
 *
 * gameChannel  — game playback (GameAudio.svelte / GameYouTube.svelte)
 * previewChannel — preview widget (PlayerWidget.svelte)
 */

import { AudioChannel } from './AudioChannel.svelte'

export const gameChannel    = new AudioChannel('game')
export const previewChannel = new AudioChannel('preview')
