/**
 * Yamaha STY 全新伴奏製作嚮導彈窗 (New Style Creator Modal)
 * 提供使用者從無到有建立符合 Yamaha SFF2 / PSR-SX920 原廠標準的全新空白伴奏檔案。
 */

import type { StyleSectionConfig } from '../core/models/style-types';

export interface NewStyleModalConfig {
  styleName: string;
  bpm: number;
  timeSignature: { numerator: number; denominator: number };
  sections: StyleSectionConfig[];
  preset: 'pop' | 'ballad' | 'rock' | 'clean';
  pilotBeat: boolean;
}

export class NewStyleModal {
  private backdropEl!: HTMLElement;
  private inputName!: HTMLInputElement;
  private inputBpm!: HTMLInputElement;
  private sliderBpm!: HTMLInputElement;
  private selectTimeSig!: HTMLSelectElement;
  private selectSectionPreset!: HTMLSelectElement;
  private customSectionsContainer!: HTMLElement;
  private selectInstPreset!: HTMLSelectElement;
  private chkPilotBeat!: HTMLInputElement;
  private summaryTextEl!: HTMLElement;
  private btnConfirm!: HTMLButtonElement;
  private btnCancel!: HTMLButtonElement;
  private btnCloseHeader!: HTMLButtonElement;

  private onConfirmCallback: ((config: NewStyleModalConfig) => void) | null = null;

  constructor() {
    this.createDOM();
    this.bindEvents();
  }

  private createDOM() {
    const wrap = document.createElement('div');
    wrap.id = 'new-style-backdrop';
    wrap.className = 'new-style-backdrop';
    wrap.style.display = 'none';

    wrap.innerHTML = `
      <div class="new-style-modal" role="dialog" aria-modal="true" aria-labelledby="ns-modal-title">
        <!-- 頂部標題列 -->
        <div class="ns-modal-header">
          <div class="ns-header-left">
            <h2 id="ns-modal-title" class="ns-modal-title">🆕 建立全新 Yamaha STY 伴奏檔</h2>
            <span class="ns-header-badge">SFF2 原廠相容</span>
          </div>
          <button id="ns-btn-close-header" class="ns-close-btn" title="關閉 (Esc)">✕</button>
        </div>

        <!-- 主體內容 -->
        <div class="ns-modal-body">
          <!-- 區塊 1: 基本資訊 -->
          <div class="ns-section-card">
            <div class="ns-card-title">1. 基本資訊與速度拍號</div>
            <div class="ns-form-grid">
              <div class="ns-form-group">
                <label class="ns-label" for="ns-input-name">伴奏名稱 (Style Name):</label>
                <input type="text" id="ns-input-name" class="ns-input-text" value="MyNewStyle" placeholder="例如 MyPopBallad_120...">
                <span class="ns-hint">將自動作為匯出伴奏的檔案名稱</span>
              </div>
              <div class="ns-form-group">
                <label class="ns-label" for="ns-select-timesig">拍號規格 (Time Signature):</label>
                <select id="ns-select-timesig" class="ns-select">
                  <option value="4/4" selected>4/4 拍 (常用流行 / 搖滾 / 抒情)</option>
                  <option value="3/4">3/4 拍 (華爾滋 / 抒情三拍)</option>
                  <option value="6/8">6/8 拍 (慢搖滾 Slow Rock / 藍調)</option>
                  <option value="2/4">2/4 拍 (進行曲 / 波卡快節奏)</option>
                </select>
              </div>
            </div>
            <div class="ns-form-group" style="margin-top: 10px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <label class="ns-label" for="ns-input-bpm">預設演奏速度 (BPM):</label>
                <span id="ns-bpm-display" style="font-family: monospace; font-weight: bold; color: #38bdf8;">120 BPM</span>
              </div>
              <div style="display: flex; align-items: center; gap: 12px; margin-top: 4px;">
                <input type="range" id="ns-slider-bpm" min="40" max="260" value="120" style="flex: 1; accent-color: #38bdf8; cursor: pointer;">
                <input type="number" id="ns-input-bpm" class="ns-input-text" min="30" max="300" value="120" style="width: 70px; text-align: center;">
              </div>
            </div>
          </div>

          <!-- 區塊 2: 伴奏曲式段落配置 -->
          <div class="ns-section-card">
            <div class="ns-card-title">2. 伴奏段落配置 (Section Layout)</div>
            <div class="ns-form-group">
              <label class="ns-label" for="ns-select-sec-preset">段落組合預設:</label>
              <select id="ns-select-sec-preset" class="ns-select">
                <option value="classic_4" selected>經典 4 段 (推薦上手) — Main A(4小節) / Fill AA(1) / Main B(4) / Ending A(2)</option>
                <option value="pop_intro_main_end">流行標準 5 段 — Intro A(4) / Main A(4) / Fill AA(1) / Main B(4) / Ending A(4)</option>
                <option value="standard_8">完整標準 8 段 — Intro A(4) / Main A~D(各4) / Fill AA~BB(各1) / Ending A(2)</option>
                <option value="custom">自訂勾選段落與小節長度...</option>
              </select>
            </div>

            <!-- 自訂段落勾選區 (當選擇 custom 時展開) -->
            <div id="ns-custom-sections" class="ns-custom-sections" style="display: none; margin-top: 10px;">
              <div class="ns-custom-sec-grid">
                <label class="ns-sec-chip"><input type="checkbox" value="Intro A" data-bars="4"> Intro A (4)</label>
                <label class="ns-sec-chip"><input type="checkbox" value="Intro B" data-bars="4"> Intro B (4)</label>
                <label class="ns-sec-chip"><input type="checkbox" value="Main A" data-bars="4" checked> Main A (4)</label>
                <label class="ns-sec-chip"><input type="checkbox" value="Main B" data-bars="4" checked> Main B (4)</label>
                <label class="ns-sec-chip"><input type="checkbox" value="Main C" data-bars="4"> Main C (4)</label>
                <label class="ns-sec-chip"><input type="checkbox" value="Main D" data-bars="4"> Main D (4)</label>
                <label class="ns-sec-chip"><input type="checkbox" value="Fill In AA" data-bars="1" checked> Fill AA (1)</label>
                <label class="ns-sec-chip"><input type="checkbox" value="Fill In BB" data-bars="1"> Fill BB (1)</label>
                <label class="ns-sec-chip"><input type="checkbox" value="Fill In CC" data-bars="1"> Fill CC (1)</label>
                <label class="ns-sec-chip"><input type="checkbox" value="Fill In DD" data-bars="1"> Fill DD (1)</label>
                <label class="ns-sec-chip"><input type="checkbox" value="Break" data-bars="1"> Break (1)</label>
                <label class="ns-sec-chip"><input type="checkbox" value="Ending A" data-bars="2" checked> Ending A (2)</label>
                <label class="ns-sec-chip"><input type="checkbox" value="Ending B" data-bars="4"> Ending B (4)</label>
              </div>
            </div>
          </div>

          <!-- 區塊 3: 樂器編制與節奏指引 -->
          <div class="ns-section-card">
            <div class="ns-card-title">3. 初始樂器編制與創作輔助</div>
            <div class="ns-form-group">
              <label class="ns-label" for="ns-select-inst-preset">8 聲部樂器編制預設:</label>
              <select id="ns-select-inst-preset" class="ns-select">
                <option value="pop" selected>現代流行樂團 (Standard Pop) — 標準鼓組 + 指彈貝斯 + CFX鋼琴 + 現場弦樂等</option>
                <option value="ballad">抒情民謠 (Acoustic Folk) — 電台打擊樂 + 原聲貝斯 + 木吉他 + 溫暖襯底Pad</option>
                <option value="rock">流行搖滾 (Pop Rock) — 搖滾鼓組 + 破音貝斯 + 破音電吉他 + 搖滾風琴</option>
                <option value="clean">純淨空白 (Clean Slate) — 8 軌標準配置，軌道 0 音符完全乾淨</option>
              </select>
            </div>
            <div style="margin-top: 12px; padding: 10px 12px; background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 8px;">
              <label class="ns-checkbox-label" title="在 Main A 的主鼓組 (CH 10) 自動寫入基礎 4 拍正拍大鼓與小鼓點，方便跟拍演奏，可隨時在鋼琴捲軸刪除或修改">
                <input type="checkbox" id="ns-chk-pilot-beat" checked>
                <span style="font-weight: 600; color: #bae6fd;">🥁 在 Main A 自動填入基礎鼓點指引 (Pilot Metronome Beat)</span>
              </label>
              <div style="font-size: 0.72rem; color: #94a3b8; margin-top: 4px; margin-left: 24px;">
                自動在第 1、3 拍產生大鼓，第 2、4 拍產生小鼓，為您在步進錄音鍵盤演奏時提供穩固的節奏打底。
              </div>
            </div>
          </div>
        </div>

        <!-- 底部確認按鈕列 -->
        <div class="ns-modal-footer">
          <div id="ns-summary-text" class="ns-summary-text">
            即將建立伴奏...
          </div>
          <div class="ns-footer-actions">
            <button id="ns-btn-cancel" class="ns-btn-secondary">取消</button>
            <button id="ns-btn-confirm" class="ns-btn-primary">✨ 立即建立伴奏</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(wrap);
    this.backdropEl = wrap;

    // 快取元件
    this.inputName = wrap.querySelector('#ns-input-name')!;
    this.inputBpm = wrap.querySelector('#ns-input-bpm')!;
    this.sliderBpm = wrap.querySelector('#ns-slider-bpm')!;
    this.selectTimeSig = wrap.querySelector('#ns-select-timesig')!;
    this.selectSectionPreset = wrap.querySelector('#ns-select-sec-preset')!;
    this.customSectionsContainer = wrap.querySelector('#ns-custom-sections')!;
    this.selectInstPreset = wrap.querySelector('#ns-select-inst-preset')!;
    this.chkPilotBeat = wrap.querySelector('#ns-chk-pilot-beat')!;
    this.summaryTextEl = wrap.querySelector('#ns-summary-text')!;
    this.btnConfirm = wrap.querySelector('#ns-btn-confirm')!;
    this.btnCancel = wrap.querySelector('#ns-btn-cancel')!;
    this.btnCloseHeader = wrap.querySelector('#ns-btn-close-header')!;
  }

  private bindEvents() {
    // 關閉
    this.btnCancel.addEventListener('click', () => this.close());
    this.btnCloseHeader.addEventListener('click', () => this.close());
    this.backdropEl.addEventListener('click', (e) => {
      if (e.target === this.backdropEl) this.close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        this.close();
      }
    });

    // BPM 雙向連動
    const bpmDisplay = this.backdropEl.querySelector('#ns-bpm-display');
    this.sliderBpm.addEventListener('input', () => {
      this.inputBpm.value = this.sliderBpm.value;
      if (bpmDisplay) bpmDisplay.textContent = `${this.sliderBpm.value} BPM`;
      this.updateSummaryText();
    });

    this.inputBpm.addEventListener('input', () => {
      let val = parseInt(this.inputBpm.value, 10);
      if (isNaN(val)) val = 120;
      val = Math.max(30, Math.min(300, val));
      this.sliderBpm.value = Math.max(40, Math.min(260, val)).toString();
      if (bpmDisplay) bpmDisplay.textContent = `${val} BPM`;
      this.updateSummaryText();
    });

    // 段落預設切換
    this.selectSectionPreset.addEventListener('change', () => {
      const isCustom = this.selectSectionPreset.value === 'custom';
      this.customSectionsContainer.style.display = isCustom ? 'block' : 'none';
      this.updateSummaryText();
    });

    // 勾選變更
    this.customSectionsContainer.addEventListener('change', () => {
      this.updateSummaryText();
    });

    this.inputName.addEventListener('input', () => this.updateSummaryText());
    this.selectTimeSig.addEventListener('change', () => this.updateSummaryText());
    this.selectInstPreset.addEventListener('change', () => this.updateSummaryText());
    this.chkPilotBeat.addEventListener('change', () => this.updateSummaryText());

    // 確認建立
    this.btnConfirm.addEventListener('click', () => this.handleConfirm());
  }

  public open(onConfirm: (config: NewStyleModalConfig) => void) {
    this.onConfirmCallback = onConfirm;
    this.backdropEl.style.display = 'flex';
    this.inputName.value = 'MyNewStyle';
    this.inputBpm.value = '120';
    this.sliderBpm.value = '120';
    const bpmDisplay = this.backdropEl.querySelector('#ns-bpm-display');
    if (bpmDisplay) bpmDisplay.textContent = '120 BPM';
    this.selectTimeSig.value = '4/4';
    this.selectSectionPreset.value = 'classic_4';
    this.customSectionsContainer.style.display = 'none';
    this.selectInstPreset.value = 'pop';
    this.chkPilotBeat.checked = true;

    this.updateSummaryText();
    this.inputName.focus();
    this.inputName.select();
  }

  public close() {
    this.backdropEl.style.display = 'none';
    this.onConfirmCallback = null;
  }

  public isOpen(): boolean {
    return this.backdropEl.style.display === 'flex';
  }

  private getSelectedSections(): StyleSectionConfig[] {
    const preset = this.selectSectionPreset.value;
    if (preset === 'classic_4') {
      return [
        { name: 'Main A', bars: 4 },
        { name: 'Fill In AA', bars: 1 },
        { name: 'Main B', bars: 4 },
        { name: 'Ending A', bars: 2 },
      ];
    } else if (preset === 'pop_intro_main_end') {
      return [
        { name: 'Intro A', bars: 4 },
        { name: 'Main A', bars: 4 },
        { name: 'Fill In AA', bars: 1 },
        { name: 'Main B', bars: 4 },
        { name: 'Ending A', bars: 4 },
      ];
    } else if (preset === 'standard_8') {
      return [
        { name: 'Intro A', bars: 4 },
        { name: 'Main A', bars: 4 },
        { name: 'Fill In AA', bars: 1 },
        { name: 'Main B', bars: 4 },
        { name: 'Fill In BB', bars: 1 },
        { name: 'Main C', bars: 4 },
        { name: 'Main D', bars: 4 },
        { name: 'Ending A', bars: 2 },
      ];
    } else {
      // 自訂勾選
      const chips = this.customSectionsContainer.querySelectorAll('.ns-sec-chip input:checked') as NodeListOf<HTMLInputElement>;
      const list: StyleSectionConfig[] = [];
      chips.forEach((c) => {
        const name = c.value;
        const bars = parseInt(c.dataset.bars || '4', 10);
        list.push({ name, bars });
      });
      return list.length > 0 ? list : [{ name: 'Main A', bars: 4 }];
    }
  }

  private updateSummaryText() {
    const name = this.inputName.value.trim() || 'MyNewStyle';
    const bpm = this.inputBpm.value || '120';
    const timeSig = this.selectTimeSig.value;
    const sections = this.getSelectedSections();
    const selectedOption = this.selectInstPreset?.options ? this.selectInstPreset.options[this.selectInstPreset.selectedIndex || 0] : null;
    const instName = selectedOption?.text?.split('—')[0]?.trim() || '流行樂團';
    const hasPilot = this.chkPilotBeat.checked;

    this.summaryTextEl.innerHTML = `
      即將建立【<strong>${name}.sty</strong>】｜ ${timeSig} 拍 ｜ ${bpm} BPM ｜ <strong>${sections.length}</strong> 個段落 ｜ ${instName} ｜ ${hasPilot ? '含基礎鼓點' : '全空白'}
    `;
  }

  private handleConfirm() {
    const name = this.inputName.value.trim() || 'MyNewStyle';
    const bpm = Math.max(30, Math.min(300, parseInt(this.inputBpm.value, 10) || 120));
    const [num, den] = this.selectTimeSig.value.split('/').map(v => parseInt(v, 10));
    const sections = this.getSelectedSections();
    const preset = this.selectInstPreset.value as 'pop' | 'ballad' | 'rock' | 'clean';
    const pilotBeat = this.chkPilotBeat.checked;

    const config: NewStyleModalConfig = {
      styleName: name,
      bpm,
      timeSignature: { numerator: num || 4, denominator: den || 4 },
      sections,
      preset,
      pilotBeat,
    };

    const cb = this.onConfirmCallback;
    this.close();
    if (cb) {
      cb(config);
    }
  }
}
