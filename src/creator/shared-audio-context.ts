/**
 * Yamaha PSR-SX920 專注創作台 (V2)
 * 全域共用高解析度 Web Audio 引擎與硬體時鐘
 * 確保鼓組、貝斯、和弦與多重伴奏軌道 100% 同步於單一硬體採樣時脈，徹底杜絕拍子抖動與忽快忽慢
 */

let sharedAudioContext: AudioContext | null = null;

export function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!sharedAudioContext) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        sharedAudioContext = new AudioCtxClass();
      }
    }
    if (sharedAudioContext && sharedAudioContext.state === 'suspended') {
      sharedAudioContext.resume().catch(() => {});
    }
    return sharedAudioContext;
  } catch (_) {
    return null;
  }
}
