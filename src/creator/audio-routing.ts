/**
 * Yamaha PSR-SX920 專注創作台 (V2)
 * 電腦端音效路由與靜音管理 (Audio Routing & Computer Audio Mute Control)
 * 當連接實體琴時，自動或手動靜音電腦端 Web Audio 合成器，避免聲音重疊延遲
 */

import { DrumSynth } from './drum-synth';
import { BassSynth } from './bass-synth';
import { ChordSynth } from './chord-synth';

export function setComputerAudioMuted(muted: boolean): void {
  DrumSynth.setMuted(muted);
  BassSynth.setMuted(muted);
  ChordSynth.setMuted(muted);
}

export function isComputerAudioMuted(): boolean {
  return DrumSynth.isMuted();
}
