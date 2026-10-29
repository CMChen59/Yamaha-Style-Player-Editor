/**
 * Yamaha STY 跨段落克隆與衍生彈窗 (Section Clone Modal)
 * 提供視覺化介面，讓使用者能一鍵將指定段落 (如 Main A) 的伴奏內容、
 * 聲部音符、音色混音與 CASM 轉調規則完整複製至目標段落 (如 Main B)。
 */

import type { YamahaFileParsed } from '../core/models/types';
import { StyleRemixer } from '../core/writer/style-remixer';
import type { CloneSectionOptions } from '../core/writer/style-modifier';

interface PartChannelMeta {
  channel: number;
  label: string;
  color: string;
  icon: string;
  group: 'rhythm' | 'bass' | 'chord' | 'phrase';
}

const YAMAHA_PARTS_INFO: PartChannelMeta[] = [
  { channel: 8, label: 'CH 9 - Rhythm 1', color: '#f59e0b', icon: '🥁', group: 'rhythm' },
  { channel: 9, label: 'CH 10 - Rhythm 2', color: '#ef4444', icon: '🥁', group: 'rhythm' },
  { channel: 10, label: 'CH 11 - Bass', color: '#10b981', icon: '🎸', group: 'bass' },
  { channel: 11, label: 'CH 12 - Chord 1', color: '#38bdf8', icon: '🎹', group: 'chord' },
  { channel: 12, label: 'CH 13 - Chord 2', color: '#818cf8', icon: '🎸', group: 'chord' },
  { channel: 13, label: 'CH 14 - Pad', color: '#c084fc', icon: '🎻', group: 'chord' },
  { channel: 14, label: 'CH 15 - Phrase 1', color: '#f472b6', icon: '🎺', group: 'phrase' },
  { channel: 15, label: 'CH 16 - Phrase 2', color: '#fb7185', icon: '🎷', group: 'phrase' },
];

export class SectionCloneModal {
  private backdropEl!: HTMLElement;
  private selectSourceSec!: HTMLSelectElement;
  private selectTargetSec!: HTMLSelectElement;
  private customTargetWrap!: HTMLElement;
  private inputCustomTarget!: HTMLInputElement;
  private channelCheckboxesContainer!: HTMLElement;
  private chkMatchMeasures!: HTMLInputElement;
  private chkOverwrite!: HTMLInputElement;
  private chkCopyMixing!: HTMLInputElement;
  private chkCopyCasm!: HTMLInputElement;
  private summaryTextEl!: HTMLElement;
  private btnConfirm!: HTMLButtonElement;
  private btnCancel!: HTMLButtonElement;
  private btnCloseHeader!: HTMLButtonElement;

  private currentParsed: YamahaFileParsed | null = null;
  private onConfirmCallback: ((srcSec: string, targetSec: string, options: CloneSectionOptions) => void) | null = null;

  constructor() {
    this.createDOM();
    this.bindEvents();
  }

  /**
   * 建立 Modal DOM 結構並掛載至 document.body
   */
  private createDOM() {
    const wrap = document.createElement('div');
    wrap.id = 'section-clone-backdrop';
    wrap.className = 'section-clone-backdrop';
    wrap.style.display = 'none';

    wrap.innerHTML = `
      <div class="section-clone-modal" role="dialog" aria-modal="true" aria-labelledby="sc-modal-title">
        <!-- 頂部標題列 -->
        <div class="sc-modal-header">
          <div class="sc-header-left">
            <h2 id="sc-modal-title" class="sc-modal-title">📋 伴奏跨段落克隆與衍生 (Section Clone)</h2>
            <span class="sc-header-badge">Tier 2-1</span>
          </div>
          <button id="sc-btn-close-header" class="sc-close-btn" title="關閉 (Esc)">✕</button>
        </div>

        <!-- 中間內容主體 -->
        <div class="sc-modal-body">
          <!-- 來源與目標段落選擇區 -->
          <div class="sc-section-route-card">
            <div class="sc-route-col">
              <label class="sc-field-label" for="sc-select-source">來源段落 (Source):</label>
              <select id="sc-select-source" class="sc-select"></select>
            </div>
            <div class="sc-route-arrow">➔ 複製至 ➔</div>
            <div class="sc-route-col">
              <label class="sc-field-label" for="sc-select-target">目標段落 (Destination):</label>
              <select id="sc-select-target" class="sc-select"></select>
              <div id="sc-custom-target-wrap" class="sc-custom-target-wrap" style="display: none;">
                <input type="text" id="sc-input-custom-target" class="sc-input-text" placeholder="輸入全新段落名稱 (如 Main C)...">
              </div>
            </div>
          </div>

          <!-- 聲部選擇區 -->
          <div class="sc-channels-box">
            <div class="sc-channels-header">
              <span class="sc-field-label">選擇欲複製的伴奏聲部:</span>
              <div class="sc-channel-presets">
                <button type="button" id="sc-btn-preset-all" class="sc-preset-btn">全選 (All)</button>
                <button type="button" id="sc-btn-preset-rb" class="sc-preset-btn">僅節奏與貝斯 (R&B)</button>
                <button type="button" id="sc-btn-preset-chord" class="sc-preset-btn">僅和弦與旋律 (Chords)</button>
              </div>
            </div>
            <div id="sc-channels-grid" class="sc-channels-grid">
              <!-- 動態渲染 8 聲部核取方塊卡片 -->
            </div>
          </div>

          <!-- 複製進階選項 -->
          <div class="sc-options-box">
            <span class="sc-field-label">複製參數設定:</span>
            <div class="sc-options-grid">
              <label class="sc-checkbox-label" title="若目標段落長度不同，自動縮放為與來源段落一致">
                <input type="checkbox" id="sc-chk-match-measures" checked>
                <span>📏 小節長度自動對齊 (Match Measure Length)</span>
              </label>
              <label class="sc-checkbox-label" title="覆蓋目標段落中選取聲部的現有音符">
                <input type="checkbox" id="sc-chk-overwrite" checked>
                <span>🗑️ 清空覆蓋目標既有音符 (Overwrite Existing Notes)</span>
              </label>
              <label class="sc-checkbox-label" title="將來源段落專屬音色與 CC 7/10 混音配置複製到目標段落">
                <input type="checkbox" id="sc-chk-copy-mixing" checked>
                <span>🎛️ 同步複製專屬音色與混音 (Copy Voices & Mixing)</span>
              </label>
              <label class="sc-checkbox-label" title="將來源段落的 CASM 和弦轉位表與路由規則同步賦予目標段落">
                <input type="checkbox" id="sc-chk-copy-casm" checked>
                <span>🎹 繼承 CASM 和弦轉調規則 (Inherit CASM Rules)</span>
              </label>
            </div>
          </div>
        </div>

        <!-- 底部確認按鈕列 -->
        <div class="sc-modal-footer">
          <div id="sc-summary-text" class="sc-summary-text">
            即將複製段落內容...
          </div>
          <div class="sc-footer-actions">
            <button id="sc-btn-cancel" class="sc-btn-secondary">取消</button>
            <button id="sc-btn-confirm" class="sc-btn-primary">✔ 確認複製段落</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(wrap);

    // 快取參照
    this.backdropEl = wrap;
    this.selectSourceSec = wrap.querySelector('#sc-select-source') as HTMLSelectElement;
    this.selectTargetSec = wrap.querySelector('#sc-select-target') as HTMLSelectElement;
    this.customTargetWrap = wrap.querySelector('#sc-custom-target-wrap') as HTMLElement;
    this.inputCustomTarget = wrap.querySelector('#sc-input-custom-target') as HTMLInputElement;
    this.channelCheckboxesContainer = wrap.querySelector('#sc-channels-grid') as HTMLElement;
    this.chkMatchMeasures = wrap.querySelector('#sc-chk-match-measures') as HTMLInputElement;
    this.chkOverwrite = wrap.querySelector('#sc-chk-overwrite') as HTMLInputElement;
    this.chkCopyMixing = wrap.querySelector('#sc-chk-copy-mixing') as HTMLInputElement;
    this.chkCopyCasm = wrap.querySelector('#sc-chk-copy-casm') as HTMLInputElement;
    this.summaryTextEl = wrap.querySelector('#sc-summary-text') as HTMLElement;
    this.btnConfirm = wrap.querySelector('#sc-btn-confirm') as HTMLButtonElement;
    this.btnCancel = wrap.querySelector('#sc-btn-cancel') as HTMLButtonElement;
    this.btnCloseHeader = wrap.querySelector('#sc-btn-close-header') as HTMLButtonElement;
  }

  /**
   * 綁定使用者交互事件
   */
  private bindEvents() {
    // 點擊背景關閉
    this.backdropEl.addEventListener('click', (e) => {
      if (e.target === this.backdropEl) this.close();
    });

    this.btnCloseHeader.addEventListener('click', () => this.close());
    this.btnCancel.addEventListener('click', () => this.close());

    // Esc 鍵關閉
    window.addEventListener('keydown', (e) => {
      if (this.isOpen() && e.key === 'Escape') this.close();
    });

    // 來源段落改變時，重新整理聲部音符數與總結
    this.selectSourceSec.addEventListener('change', () => {
      this.refreshChannelNoteCounts();
      this.updateSummaryText();
    });

    // 目標段落改變時
    this.selectTargetSec.addEventListener('change', () => {
      const isNew = this.selectTargetSec.value === '__NEW__';
      this.customTargetWrap.style.display = isNew ? 'block' : 'none';
      if (isNew) this.inputCustomTarget?.focus?.();
      this.updateSummaryText();
    });

    this.inputCustomTarget.addEventListener('input', () => {
      this.updateSummaryText();
    });

    // 快捷預設按鈕
    const btnAll = this.backdropEl.querySelector('#sc-btn-preset-all');
    const btnRB = this.backdropEl.querySelector('#sc-btn-preset-rb');
    const btnChord = this.backdropEl.querySelector('#sc-btn-preset-chord');

    btnAll?.addEventListener('click', () => this.setChannelPreset('all'));
    btnRB?.addEventListener('click', () => this.setChannelPreset('rb'));
    btnChord?.addEventListener('click', () => this.setChannelPreset('chord'));

    // 確認按鈕
    this.btnConfirm.addEventListener('click', () => {
      this.handleConfirm();
    });
  }

  /**
   * 開啟克隆彈窗
   */
  public open(
    parsed: YamahaFileParsed,
    defaultSourceSec: string,
    onConfirm: (srcSec: string, targetSec: string, options: CloneSectionOptions) => void
  ) {
    this.currentParsed = parsed;
    this.onConfirmCallback = onConfirm;

    const musical = StyleRemixer.getMusicalSections(parsed);
    if (musical.length === 0) {
      alert('伴奏檔案中查無任何音樂段落');
      return;
    }

    // 填充來源段落下拉選單
    this.selectSourceSec.innerHTML = '';
    musical.forEach(sec => {
      const opt = document.createElement('option');
      opt.value = sec.name;
      const range = StyleRemixer.getSectionTickRange(parsed, sec.name);
      opt.textContent = `${sec.name} (${range?.measureCount ?? 1} 小節)`;
      if (sec.name.toLowerCase() === defaultSourceSec.toLowerCase()) {
        opt.selected = true;
      }
      this.selectSourceSec.appendChild(opt);
    });

    // 填充目標段落下拉選單
    this.selectTargetSec.innerHTML = '';
    musical.forEach(sec => {
      const opt = document.createElement('option');
      opt.value = sec.name;
      const range = StyleRemixer.getSectionTickRange(parsed, sec.name);
      opt.textContent = `${sec.name} (${range?.measureCount ?? 1} 小節)`;
      this.selectTargetSec.appendChild(opt);
    });

    // 增加「建立新段落...」選項
    const optNew = document.createElement('option');
    optNew.value = '__NEW__';
    optNew.textContent = '➕ 建立全新段落...';
    this.selectTargetSec.appendChild(optNew);

    // 智慧預選目標段落 (優先選擇與來源相鄰的段落，如 Main A 預選 Main B)
    const currentSrcName = this.selectSourceSec.value;
    let preferredTarget = '';
    if (currentSrcName.toLowerCase() === 'main a') preferredTarget = 'main b';
    else if (currentSrcName.toLowerCase() === 'main b') preferredTarget = 'main c';
    else if (currentSrcName.toLowerCase() === 'main c') preferredTarget = 'main d';
    else {
      const other = musical.find(s => s.name.toLowerCase() !== currentSrcName.toLowerCase());
      if (other) preferredTarget = other.name.toLowerCase();
    }

    let foundTarget = false;
    Array.from(this.selectTargetSec.options).forEach(opt => {
      if (opt.value.toLowerCase() === preferredTarget) {
        opt.selected = true;
        foundTarget = true;
      }
    });
    if (!foundTarget && this.selectTargetSec.options.length > 0) {
      this.selectTargetSec.selectedIndex = 0;
    }

    this.customTargetWrap.style.display = 'none';
    this.inputCustomTarget.value = '';

    // 渲染聲部核取方塊
    this.renderChannelCheckboxes();
    this.updateSummaryText();

    // 顯示 Modal
    this.backdropEl.style.display = 'flex';
  }

  /**
   * 關閉彈窗
   */
  public close() {
    this.backdropEl.style.display = 'none';
  }

  public isOpen(): boolean {
    return this.backdropEl.style.display !== 'none';
  }

  /**
   * 渲染 8 大伴奏聲部的核取方塊卡片
   */
  private renderChannelCheckboxes() {
    this.channelCheckboxesContainer.innerHTML = '';
    YAMAHA_PARTS_INFO.forEach(part => {
      const card = document.createElement('label');
      card.className = 'sc-channel-item';
      card.style.setProperty('--part-accent', part.color);

      card.innerHTML = `
        <input type="checkbox" class="sc-ch-checkbox" data-channel="${part.channel}" checked>
        <span class="sc-ch-icon">${part.icon}</span>
        <div class="sc-ch-info">
          <span class="sc-ch-title">${part.label}</span>
          <span class="sc-ch-count" id="sc-ch-count-${part.channel}">計算音符中...</span>
        </div>
      `;

      const chk = card.querySelector('.sc-ch-checkbox') as HTMLInputElement;
      chk.addEventListener('change', () => {
        card.classList.toggle('is-checked', chk.checked);
        this.updateSummaryText();
      });
      card.classList.add('is-checked');

      this.channelCheckboxesContainer.appendChild(card);
    });

    this.refreshChannelNoteCounts();
  }

  /**
   * 重新計算來源段落中各聲部的音符數量
   */
  private refreshChannelNoteCounts() {
    if (!this.currentParsed) return;
    const srcSec = this.selectSourceSec.value;
    const srcRange = StyleRemixer.getSectionTickRange(this.currentParsed, srcSec);
    if (!srcRange) return;

    YAMAHA_PARTS_INFO.forEach(part => {
      const count = StyleRemixer.countNotesInChannel(
        this.currentParsed!,
        srcRange.startTick,
        srcRange.endTick,
        part.channel
      );
      const countEl = document.getElementById(`sc-ch-count-${part.channel}`);
      if (countEl) {
        countEl.textContent = count > 0 ? `${count} 顆音符` : '無音符 (空)';
        countEl.style.color = count > 0 ? '#38bdf8' : '#64748b';
      }
    });
  }

  /**
   * 設定聲部預設選取狀態
   */
  private setChannelPreset(preset: 'all' | 'rb' | 'chord') {
    const checkboxes = this.channelCheckboxesContainer.querySelectorAll('.sc-ch-checkbox') as NodeListOf<HTMLInputElement>;
    checkboxes.forEach(chk => {
      const ch = parseInt(chk.dataset.channel || '0', 10);
      const meta = YAMAHA_PARTS_INFO.find(p => p.channel === ch);
      if (!meta) return;

      if (preset === 'all') chk.checked = true;
      else if (preset === 'rb') chk.checked = (meta.group === 'rhythm' || meta.group === 'bass');
      else if (preset === 'chord') chk.checked = (meta.group === 'chord' || meta.group === 'phrase');

      const parent = chk.closest('.sc-channel-item');
      parent?.classList.toggle('is-checked', chk.checked);
    });

    this.updateSummaryText();
  }

  /**
   * 取得已勾選的 Channel 陣列
   */
  private getSelectedChannels(): number[] {
    const checkboxes = this.channelCheckboxesContainer.querySelectorAll('.sc-ch-checkbox:checked') as NodeListOf<HTMLInputElement>;
    return Array.from(checkboxes).map(c => parseInt(c.dataset.channel || '0', 10));
  }

  /**
   * 更新底部總結說明文字
   */
  private updateSummaryText() {
    const srcSec = this.selectSourceSec.value || '來源段落';
    let targetSec = this.selectTargetSec.value;
    if (targetSec === '__NEW__') {
      targetSec = this.inputCustomTarget.value.trim() || '新段落';
    }

    const selectedChs = this.getSelectedChannels();
    this.btnConfirm.disabled = selectedChs.length === 0 || srcSec === targetSec;

    if (srcSec === targetSec) {
      this.summaryTextEl.innerHTML = `<span style="color: #f43f5e;">⚠️ 來源段落與目標段落不能相同，請重新選擇。</span>`;
      return;
    }

    if (selectedChs.length === 0) {
      this.summaryTextEl.innerHTML = `<span style="color: #f59e0b;">請至少勾選 1 個欲複製的伴奏聲部。</span>`;
      return;
    }

    this.summaryTextEl.innerHTML = `
      即將將【<strong>${srcSec}</strong>】的 <strong>${selectedChs.length}</strong> 個聲部複製到【<strong>${targetSec}</strong>】
    `;
  }

  /**
   * 點擊確認複製
   */
  private handleConfirm() {
    const srcSec = this.selectSourceSec.value;
    let targetSec = this.selectTargetSec.value;

    if (targetSec === '__NEW__') {
      targetSec = this.inputCustomTarget.value.trim();
      if (!targetSec) {
        alert('請輸入有效的新段落名稱 (例如 Main C 或 Ending B)');
        this.inputCustomTarget?.focus?.();
        return;
      }
    }

    if (srcSec.toLowerCase() === targetSec.toLowerCase()) {
      alert('來源段落與目標段落不能相同！');
      return;
    }

    const channels = this.getSelectedChannels();
    if (channels.length === 0) {
      alert('請至少勾選 1 個欲複製的伴奏聲部！');
      return;
    }

    const options: CloneSectionOptions = {
      channels,
      matchMeasures: this.chkMatchMeasures.checked,
      overwrite: this.chkOverwrite.checked,
      copyMixing: this.chkCopyMixing.checked,
      copyCasm: this.chkCopyCasm.checked,
    };

    this.close();

    if (this.onConfirmCallback) {
      this.onConfirmCallback(srcSec, targetSec, options);
    }
  }
}
