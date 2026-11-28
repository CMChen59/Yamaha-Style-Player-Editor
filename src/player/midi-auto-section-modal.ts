/**
 * MIDI 智慧段落自動偵測與直通切片彈窗 (MidiAutoSectionModal)
 * 優先聚焦於【前奏 Intro A、間奏 Intro B、尾奏 Ending A】三大直通段落，
 * 提供視覺化段落小節檢視、小節區間即時試聽、單段切片與一鍵批次組裝至 STY 伴奏檔。
 */

import type { YamahaFileParsed } from '../core/models/types';
import type { MidiSongAnalysis } from '../core/parser/midi-song-analyzer';
import {
  MidiStructureDetector,
  type SongStructureDetectionResult,
  type DetectedSection,
} from '../core/parser/midi-structure-detector';

export class MidiAutoSectionModal {
  private backdropEl: HTMLElement | null = null;
  private currentAnalysis: MidiSongAnalysis | null = null;
  private currentParsed: YamahaFileParsed | null = null;
  private baseStyleParsed?: YamahaFileParsed | null = null;
  private detectionResult: SongStructureDetectionResult | null = null;

  // 回呼函式
  private onApplyAuditionRange?: (startBar: number, endBar: number, startBeat?: number, endBeat?: number) => void;
  private onSliceSingleSection?: (section: DetectedSection) => void;
  private onBatchAssembleCompleted?: (styleParsed: YamahaFileParsed, sections: DetectedSection[]) => void;

  constructor() {
    this.createDom();
  }

  public setCallbacks(callbacks: {
    onApplyAuditionRange: (startBar: number, endBar: number, startBeat?: number, endBeat?: number) => void;
    onSliceSingleSection: (section: DetectedSection) => void;
    onBatchAssembleCompleted: (styleParsed: YamahaFileParsed, sections: DetectedSection[]) => void;
  }) {
    this.onApplyAuditionRange = callbacks.onApplyAuditionRange;
    this.onSliceSingleSection = callbacks.onSliceSingleSection;
    this.onBatchAssembleCompleted = callbacks.onBatchAssembleCompleted;
  }

  private createDom() {
    if (document.getElementById('auto-section-modal-backdrop')) {
      this.backdropEl = document.getElementById('auto-section-modal-backdrop');
      return;
    }

    const backdrop = document.createElement('div');
    backdrop.id = 'auto-section-modal-backdrop';
    backdrop.className = 'add-section-backdrop';
    backdrop.style.display = 'none';

    backdrop.innerHTML = `
      <div class="add-section-modal" style="max-width: 720px;" role="dialog" aria-modal="true">
        <div class="as-modal-header">
          <div class="as-header-left">
            <span class="as-header-icon">⚡</span>
            <div>
              <div class="as-header-title">智慧段落自動偵測與直通切片</div>
              <div class="as-header-subtitle">優先辨識【前奏 · 間奏 · 尾奏】三大直通段落 (原曲直通零走音風險)</div>
            </div>
          </div>
          <button type="button" class="as-close-btn" id="btn-close-auto-section" title="關閉">✕</button>
        </div>

        <div class="as-modal-body" style="padding: 16px 20px; max-height: 75vh; overflow-y: auto;">
          <!-- 樂曲主唱與偵測摘要橫幅 -->
          <div id="auto-sec-summary-banner" style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 1.1rem;">🎙️</span>
              <div>
                <div id="auto-sec-song-title" style="font-size: 0.85rem; font-weight: 700; color: #f8fafc;">樂曲主唱偵測中...</div>
                <div id="auto-sec-song-meta" style="font-size: 0.75rem; color: #94a3b8;">全曲小節數與格式</div>
              </div>
            </div>
            <div style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 6px; padding: 4px 10px; font-size: 0.75rem; color: #34d399; font-weight: 700;">
              ✨ 第一階段：直通段落優先
            </div>
          </div>

          <!-- 段落推薦卡片容器 -->
          <div id="auto-sec-cards-container" style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px;">
            <!-- 卡片由 JS 動態注入 -->
          </div>
        </div>

        <div class="as-modal-footer" style="padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; background: rgba(15, 23, 42, 0.95); border-top: 1px solid rgba(51, 65, 85, 0.6); flex-wrap: wrap; gap: 10px;">
          <div style="font-size: 0.76rem; color: #94a3b8;">
            💡 提示：點擊「試聽」可在上方定位器循環播放；點擊「一鍵組裝」將全數切入 STY 伴奏。
          </div>
          <div style="display: flex; gap: 10px; align-items: center;">
            <button type="button" id="btn-cancel-auto-section" class="midi-locator-btn" style="background: rgba(100, 116, 139, 0.2); border-color: rgba(100, 116, 139, 0.4); color: #cbd5e1;">關閉</button>
            <button type="button" id="btn-batch-assemble-sections" class="midi-locator-btn" style="background: linear-gradient(135deg, #10b981, #059669); border-color: #10b981; color: #ffffff; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px;">
              <span>⚡ 一鍵自動切片組裝 (Intro A + Intro B + Ending A)</span>
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    this.backdropEl = backdrop;

    // 綁定關閉事件
    backdrop.querySelector('#btn-close-auto-section')?.addEventListener('click', () => this.close());
    backdrop.querySelector('#btn-cancel-auto-section')?.addEventListener('click', () => this.close());
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) this.close();
    });

    // 綁定一鍵批次組裝
    backdrop.querySelector('#btn-batch-assemble-sections')?.addEventListener('click', () => {
      this.handleBatchAssemble();
    });
  }

  /**
   * 打開智慧段落偵測彈窗
   */
  public open(parsed: YamahaFileParsed, analysis: MidiSongAnalysis, baseStyleParsed?: YamahaFileParsed | null) {
    this.currentParsed = parsed;
    this.currentAnalysis = analysis;
    this.baseStyleParsed = baseStyleParsed;

    // 執行樂曲結構偵測
    const detection = MidiStructureDetector.detectStructure(parsed, analysis);
    this.detectionResult = detection;

    this.renderDetectionUI(detection);

    if (this.backdropEl) {
      this.backdropEl.style.display = 'flex';
    }
  }

  public close() {
    if (this.backdropEl) {
      this.backdropEl.style.display = 'none';
    }
  }

  /**
   * 渲染偵測結果
   */
  private renderDetectionUI(detection: SongStructureDetectionResult) {
    if (!this.backdropEl) return;

    // 橫幅資訊
    const titleEl = this.backdropEl.querySelector('#auto-sec-song-title');
    const metaEl = this.backdropEl.querySelector('#auto-sec-song-meta');
    if (titleEl) {
      titleEl.textContent = `全曲主唱 / 核心旋律識別：${detection.globalMelodyName} (CH ${detection.globalMelodyChannel !== null ? detection.globalMelodyChannel + 1 : '?'})`;
    }
    if (metaEl) {
      metaEl.textContent = `檔案: ${detection.fileName} ｜ 總小節數: ${detection.totalBars} 小節 ｜ 調性: ${this.currentAnalysis?.keySignatureLabel || '未知'}`;
    }

    // 渲染段落卡片
    const container = this.backdropEl.querySelector('#auto-sec-cards-container');
    if (!container) return;

    if (detection.simpleSections.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 30px; color: #94a3b8; font-size: 0.85rem;">
          ⚠️ 未能在本曲中自動偵測到明確的前奏/間奏/尾奏結構，您仍可使用手動切片定位器進行裁切。
        </div>
      `;
      return;
    }

    const badgeColors: Record<string, { bg: string; border: string; text: string; icon: string }> = {
      'Intro A': { bg: 'rgba(56, 189, 248, 0.15)', border: 'rgba(56, 189, 248, 0.4)', text: '#38bdf8', icon: '🎺' },
      'Intro B': { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.4)', text: '#fbbf24', icon: '🎸' },
      'Ending A': { bg: 'rgba(168, 85, 247, 0.15)', border: 'rgba(168, 85, 247, 0.4)', text: '#c084fc', icon: '🏁' },
    };

    container.innerHTML = detection.simpleSections.map((sec, idx) => {
      const style = badgeColors[sec.targetSection] || {
        bg: 'rgba(100, 116, 139, 0.15)',
        border: 'rgba(100, 116, 139, 0.4)',
        text: '#cbd5e1',
        icon: '🎵',
      };

      const startBeatStr = sec.startBeat > 1 ? ` 第 ${sec.startBeat} 拍起音` : '';
      const leadInstStr = sec.leadInstruments.join('、');

      return `
        <div class="auto-sec-card" data-index="${idx}" style="background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(71, 85, 105, 0.4); border-radius: 8px; padding: 12px 16px; transition: border-color 0.2s;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 1.2rem;">${style.icon}</span>
              <span style="font-size: 0.92rem; font-weight: 700; color: #f8fafc;">${sec.nameZh}</span>
              <span style="background: ${style.bg}; border: 1px solid ${style.border}; color: ${style.text}; font-size: 0.72rem; font-weight: 700; padding: 2px 7px; border-radius: 4px;">
                ${sec.barLength} 小節
              </span>
              <span style="background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.3); color: #34d399; font-size: 0.72rem; padding: 2px 6px; border-radius: 4px;">
                原曲直通 (Bypass)
              </span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <button type="button" class="midi-locator-btn btn-audition-sec" data-index="${idx}" style="background: rgba(56, 189, 248, 0.15); border-color: rgba(56, 189, 248, 0.4); color: #38bdf8; font-size: 0.75rem; padding: 3px 9px;" title="在主播放列循環試聽此段落小節區間">
                ▶ 試聽此段
              </button>
              <button type="button" class="midi-locator-btn btn-slice-single-sec" data-index="${idx}" style="background: linear-gradient(135deg, #6366f1, #4f46e5); border-color: #6366f1; color: #ffffff; font-size: 0.75rem; font-weight: 700; padding: 3px 10px;" title="單獨切片此段落指派入伴奏">
                ✂️ 單獨切入 ${sec.targetSection}
              </button>
            </div>
          </div>

          <div style="font-size: 0.8rem; color: #cbd5e1; margin-bottom: 6px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
            <span>📍 <strong>小節區間：</strong>第 <strong>${sec.startBar}</strong> 節${startBeatStr} ～ 第 <strong>${sec.endBar}</strong> 節</span>
            <span>🎷 <strong>領奏樂器：</strong>${leadInstStr}</span>
          </div>

          <div style="font-size: 0.75rem; color: #94a3b8; line-height: 1.4; background: rgba(15, 23, 42, 0.4); border-radius: 4px; padding: 6px 10px;">
            ${sec.reasonZh}
          </div>
        </div>
      `;
    }).join('');

    // 綁定各卡片操作事件
    container.querySelectorAll('.btn-audition-sec').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt((btn as HTMLElement).getAttribute('data-index') || '0', 10);
        const sec = detection.simpleSections[idx];
        if (sec && this.onApplyAuditionRange) {
          this.onApplyAuditionRange(sec.startBar, sec.endBar, sec.startBeat, sec.endBeat);
          // 視覺反饋
          btn.textContent = '🔊 播放中...';
          setTimeout(() => { btn.textContent = '▶ 試聽此段'; }, 2000);
        }
      });
    });

    container.querySelectorAll('.btn-slice-single-sec').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt((btn as HTMLElement).getAttribute('data-index') || '0', 10);
        const sec = detection.simpleSections[idx];
        if (sec && this.onSliceSingleSection) {
          this.close();
          this.onSliceSingleSection(sec);
        }
      });
    });
  }

  /**
   * 處理一鍵自動組裝全套直通段落
   */
  private handleBatchAssemble() {
    if (!this.currentParsed || !this.currentAnalysis || !this.detectionResult) return;

    const sections = this.detectionResult.simpleSections;
    if (sections.length === 0) {
      alert('未偵測到任何可組裝之段落！');
      return;
    }

    try {
      const btn = this.backdropEl?.querySelector('#btn-batch-assemble-sections') as HTMLButtonElement | null;
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>⏳ 批次切片組裝中...</span>';
      }

      // 呼叫底層批次組裝引擎
      const res = MidiStructureDetector.batchAssembleSections({
        sourceParsed: this.currentParsed,
        analysis: this.currentAnalysis,
        sectionsToAssemble: sections,
        baseStyleParsed: this.baseStyleParsed || undefined,
      });

      this.close();

      if (this.onBatchAssembleCompleted) {
        this.onBatchAssembleCompleted(res.styleParsed, sections);
      }
    } catch (err: any) {
      console.error('批次組裝失敗:', err);
      alert(`批次組裝失敗: ${err.message || err}`);
    } finally {
      const btn = this.backdropEl?.querySelector('#btn-batch-assemble-sections') as HTMLButtonElement | null;
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span>⚡ 一鍵自動切片組裝 (Intro A + Intro B + Ending A)</span>';
      }
    }
  }
}
