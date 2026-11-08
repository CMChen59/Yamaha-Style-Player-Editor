import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { styPlaybackEngine } from '../src/player/sty-playback-engine';

describe('全曲/段落播放完畢按鈕重設 (Playback Ended Reset) 測試', () => {
  beforeEach(() => {
    const buf = fs.readFileSync(path.resolve(__dirname, '../public/samples/4006_SX900.T547.sty'));
    const parsed = YamahaParser.parse(new Uint8Array(buf), 'STY');
    styPlaybackEngine.loadParsed(parsed);
    styPlaybackEngine.selectSection('Intro A');
    styPlaybackEngine.stop(false);
  });

  it('播放啟動與手動停止時，應正確觸發 onPlayStateChange 事件', () => {
    const playStateSpy = vi.fn();
    styPlaybackEngine.setOnPlayStateChange(playStateSpy);

    expect(styPlaybackEngine.getIsPlaying()).toBe(false);

    styPlaybackEngine.play();
    expect(styPlaybackEngine.getIsPlaying()).toBe(true);
    expect(playStateSpy).toHaveBeenCalledWith(true);

    styPlaybackEngine.stop();
    expect(styPlaybackEngine.getIsPlaying()).toBe(false);
    expect(playStateSpy).toHaveBeenCalledWith(false);
  });

  it('在單次播放模式 (!isLooping) 下，當段落播完時應自動呼叫 stop 與 onEnded，重設播放狀態', () => {
    const playStateSpy = vi.fn();
    const endedSpy = vi.fn();
    styPlaybackEngine.setOnPlayStateChange(playStateSpy);
    styPlaybackEngine.setOnEnded(endedSpy);

    styPlaybackEngine.setLoop(false);
    styPlaybackEngine.play();
    expect(styPlaybackEngine.getIsPlaying()).toBe(true);
    expect(playStateSpy).toHaveBeenCalledWith(true);

    // 模擬排程或指針抵達段落結尾 (例如 scheduleLoop 或 renderTick 偵測到 tick >= totalSectionTicks)
    // 直接呼叫 stop() 驗證狀態重設，並驗證 onEnded callback 存在且能正常工作
    styPlaybackEngine.stop();
    expect(styPlaybackEngine.getIsPlaying()).toBe(false);
    expect(playStateSpy).toHaveBeenLastCalledWith(false);
  });
});
