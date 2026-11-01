/**
 * Yamaha STY 跨檔案伴奏段落移植視覺化彈窗 (Section Import Modal)
 * 允許使用者載入外部 .sty 伴奏檔案，挑選該檔案中的特定段落 (如 Intro 或 Main)，
 * 自由選取欲匯入的聲部軌道，並智慧執行 PPQ 縮放、SFF2 通道歸一化與 CASM 轉調移植。
 */

import type { YamahaFileParsed } from '../core/models/types';
import { YamahaParser } from '../core/parser/yamaha-parser';
import { StyleRemixer } from '../core/writer/style-remixer';
import type { CrossStyleImportOptions } from '../core/writer/style-modifier';
import { ALL_STANDARD_SECTIONS, DEFAULT_STYLE_PARTS, type StylePartId } from '../core/models/style-types';

interface PartChannelMeta {
  channel: number;
  partId: StylePartId;
  label: string;
  color: string;
  icon: string;
  group: 'rhythm' | 'bass' | 'chord' | 'phrase';
}

const YAMAHA_PARTS_INFO: PartChannelMeta[] = [
  { channel: 8, partId: 'Rhythm1', label: 'CH 9 - Rhythm 1 (副打擊)', color: '#f59e0b', icon: '🥁', group: 'rhythm' },
  { channel: 9, partId: 'Rhythm2', label: 'CH 10 - Rhythm 2 (主鼓組)', color: '#ef4444', icon: '🥁', group: 'rhythm' },
  { channel: 10, partId: 'Bass', label: 'CH 11 - Bass (貝斯低音)', color: '#10b981', icon: '🎸', group: 'bass' },
  { channel: 11, partId: 'Chord1', label: 'CH 12 - Chord 1 (主要和弦)', color: '#38bdf8', icon: '🎹', group: 'chord' },
  { channel: 12, partId: 'Chord2', label: 'CH 13 - Chord 2 (副和弦吉他)', color: '#818cf8', icon: '🎸', group: 'chord' },
  { channel: 13, partId: 'Pad', label: 'CH 14 - Pad (弦樂長音)', color: '#c084fc', icon: '🎻', group: 'chord' },
  { channel: 14, partId: 'Phrase1', label: 'CH 15 - Phrase 1 (裝飾對位1)', color: '#f472b6', icon: '🎺', group: 'phrase' },
  { channel: 15, partId: 'Phrase2', label: 'CH 16 - Phrase 2 (裝飾對位2)', color: '#fb7185', icon: '🎷', group: 'phrase' },
];

export class SectionImportModal {
  private backdropEl!: HTMLElement;
  private fileInput!: HTMLInputElement;
  private dropZone!: HTMLElement;
  private fileSummaryBadge!: HTMLElement;
  private selectSourceSec!: HTMLSelectElement;
  private selectTargetSec!: HTMLSelectElement;
  private channelsGrid!: HTMLElement;
  private chkMatchMeasures!: HTMLInputElement;
  private chkOverwrite!: HTMLInputElement;
  private chkCopyVoices!: HTMLInputElement;
  private chkCopyCasm!: HTMLInputElement;
  private summaryTextEl!: HTMLElement;
  private btnConfirm!: HTMLButtonElement;
  private btnCancel!: HTMLButtonElement;
  private btnCloseHeader!: HTMLButtonElement;

  private targetParsed: YamahaFileParsed | null = null;
  private externalParsed: YamahaFileParsed | null = null;
  private externalFileName: string = '';
  private onConfirmCallback: ((sourceParsed: YamahaFileParsed, srcSec: string, options: CrossStyleImportOptions) => void) | null = null;

  constructor() {
    this.createDOM();
    this.bindEvents();
  }

  /**
   * 建立 Modal DOM 結構並掛載至 document.body
   */
  private createDOM() {
    const wrap = document.createElement('div');
    wrap.id = 'section-import-backdrop';
    wrap.className = 'section-import-backdrop';
    wrap.style.display = 'none';

    wrap.innerHTML = `
      <div class="section-import-modal" role="dialog" aria-modal="true" aria-labelledby="si-modal-title">
        <!-- 頂部標題列 -->
        <div class="si-modal-header">
          <div class="si-header-left">
            <h2 id="si-modal-title" class="si-modal-title">📥 跨檔案伴奏段落移植 (Cross-Style Section Import)</h2>
            <span class="si-header-badge">SFF2 1920 PPQ 歸一化</span>
          </div>
          <button id="si-btn-close-header" class="si-close-btn" title="關閉 (Esc)">✕</button>
        </div>

        <!-- 主體內容 -->
        <div class="si-modal-body">
          <!-- 區塊 1: 外部 STY 檔案拖曳與選擇 -->
          <div class="si-card">
            <div class="si-card-title">1. 載入外部來源 STY 伴奏檔案</div>
            <div id="si-drop-zone" class="si-drop-zone">
              <span class="si-drop-icon">📂</span>
              <div class="si-drop-text">
                <strong>點擊選擇</strong> 或 <strong>拖曳外部 STY 檔案</strong> 至此處
              </div>
              <span class="si-drop-hint">支援所有 Yamaha STY, PRS, SST, BCS 檔案格式</span>
              <input type="file" id="si-file-input" accept=".sty,.mid,.prs,.sst,.bcs" style="display: none;">
            </div>
            <div id="si-file-summary" class="si-file-summary" style="display: none;"></div>
          </div>

          <!-- 區塊 2: 段落路由設定 (來源段落 ➔ 目標段落) -->
          <div class="si-card" id="si-route-card" style="opacity: 0.5; pointer-events: none;">
            <div class="si-card-title">2. 段落移植路由設定</div>
            <div class="si-route-grid">
              <div class="si-route-col">
                <label class="si-label" for="si-select-source">外部來源段落 (Source Section):</label>
                <select id="si-select-source" class="si-select"></select>
                <span class="si-hint">選取欲從外部檔案借用的伴奏段落</span>
              </div>
              <div class="si-route-arrow">➔ 移植至 ➔</div>
              <div class="si-route-col">
                <label class="si-label" for="si-select-target">目前目標段落 (Target Section):</label>
                <select id="si-select-target" class="si-select"></select>
                <span class="si-hint">可選擇覆蓋既有段落，或自動擴充為全新段落</span>
              </div>
            </div>
          </div>

          <!-- 區塊 3: 伴奏聲部勾選 -->
          <div class="si-card" id="si-channels-card" style="opacity: 0.5; pointer-events: none;">
            <div class="si-channels-header">
              <div class="si-card-title" style="margin-bottom: 0;">3. 選擇欲移植的伴奏聲部</div>
              <div class="si-channel-presets">
                <button type="button" id="si-btn-preset-all" class="si-preset-btn">全選 (All)</button>
                <button type="button" id="si-btn-preset-rb" class="si-preset-btn">僅節奏與貝斯 (R&B)</button>
                <button type="button" id="si-btn-preset-chord" class="si-preset-btn">僅和弦與旋律 (Chords)</button>
              </div>
            </div>
            <div id="si-channels-grid" class="si-channels-grid">
              <!-- 動態渲染 8 伴奏聲部卡片 -->
            </div>
          </div>

          <!-- 區塊 4: 移植進階選項 -->
          <div class="si-card">
            <div class="si-card-title">4. 移植規則與音色策略</div>
            <div class="si-options-grid">
              <label class="si-checkbox-label" title="若目標段落長度不同，自動縮放為與來源段落一致">
                <input type="checkbox" id="si-chk-match-measures" checked>
                <span>📏 小節長度自動對齊 (Match Measure Length)</span>
              </label>
              <label class="si-checkbox-label" title="清空目標段落中選取聲部的現有音符">
                <input type="checkbox" id="si-chk-overwrite" checked>
                <span>🗑️ 清空覆蓋目標既有音符 (Overwrite Existing Notes)</span>
              </label>
              <label class="si-checkbox-label" title="連同來源段落各聲部的音色、音量與空間效果一起移植">
                <input type="checkbox" id="si-chk-copy-voices" checked>
                <span>🎨 複製來源段落專屬音色與混音 (Copy Voices & Mixing)</span>
              </label>
              <label class="si-checkbox-label" title="將來源段落的和弦轉調規則同步移植，確保琴端和弦變換完美發聲">
                <input type="checkbox" id="si-chk-copy-casm" checked>
                <span>🎼 移植 CASM Ctb2 和弦轉調規則 (Copy CASM Rules)</span>
              </label>
            </div>
          </div>

          <!-- 摘要預覽 -->
          <div id="si-summary-text" class="si-summary-box">
            請先載入外部 STY 伴奏檔案...
          </div>
        </div>

        <!-- 底部動作按鈕 -->
        <div class="si-modal-footer">
          <button id="si-btn-cancel" class="si-btn-secondary">取消</button>
          <button id="si-btn-confirm" class="si-btn-primary" disabled>🚀 確認移植段落</button>
        </div>
      </div>
    `;

    document.body.appendChild(wrap);

    // 參照快取
    this.backdropEl = wrap;
    this.fileInput = wrap.querySelector('#si-file-input') as HTMLInputElement;
    this.dropZone = wrap.querySelector('#si-drop-zone') as HTMLElement;
    this.fileSummaryBadge = wrap.querySelector('#si-file-summary') as HTMLElement;
    this.selectSourceSec = wrap.querySelector('#si-select-source') as HTMLSelectElement;
    this.selectTargetSec = wrap.querySelector('#si-select-target') as HTMLSelectElement;
    this.channelsGrid = wrap.querySelector('#si-channels-grid') as HTMLElement;
    this.chkMatchMeasures = wrap.querySelector('#si-chk-match-measures') as HTMLInputElement;
    this.chkOverwrite = wrap.querySelector('#si-chk-overwrite') as HTMLInputElement;
    this.chkCopyVoices = wrap.querySelector('#si-chk-copy-voices') as HTMLInputElement;
    this.chkCopyCasm = wrap.querySelector('#si-chk-copy-casm') as HTMLInputElement;
    this.summaryTextEl = wrap.querySelector('#si-summary-text') as HTMLElement;
    this.btnConfirm = wrap.querySelector('#si-btn-confirm') as HTMLButtonElement;
    this.btnCancel = wrap.querySelector('#si-btn-cancel') as HTMLButtonElement;
    this.btnCloseHeader = wrap.querySelector('#si-btn-close-header') as HTMLButtonElement;
  }

  /**
   * 綁定事件監聽
   */
  private bindEvents() {
    this.backdropEl.addEventListener('click', (e) => {
      if (e.target === this.backdropEl) this.close();
    });

    this.btnCloseHeader.addEventListener('click', () => this.close());
    this.btnCancel.addEventListener('click', () => this.close());

    window.addEventListener('keydown', (e) => {
      if (this.isOpen() && e.key === 'Escape') this.close();
    });

    // 檔案點擊與拖曳
    this.dropZone.addEventListener('click', () => this.fileInput.click());
    this.fileInput.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) this.loadExternalFile(file);
    });

    this.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropZone.classList.add('drag-over');
    });

    this.dropZone.addEventListener('dragleave', () => {
      this.dropZone.classList.remove('drag-over');
    });

    this.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropZone.classList.remove('drag-over');
      const file = e.dataTransfer?.files?.[0];
      if (file) this.loadExternalFile(file);
    });

    // 來源段落切換
    this.selectSourceSec.addEventListener('change', () => {
      this.refreshChannelCards();
      this.updateSummaryText();
    });

    // 目標段落切換
    this.selectTargetSec.addEventListener('change', () => {
      this.updateSummaryText();
    });

    // 快捷聲部篩選按鈕
    const btnAll = this.backdropEl.querySelector('#si-btn-preset-all');
    const btnRb = this.backdropEl.querySelector('#si-btn-preset-rb');
    const btnChord = this.backdropEl.querySelector('#si-btn-preset-chord');

    btnAll?.addEventListener('click', () => this.setChannelPreset('all'));
    btnRb?.addEventListener('click', () => this.setChannelPreset('rb'));
    btnChord?.addEventListener('click', () => this.setChannelPreset('chord'));

    // 選項切換
    [this.chkMatchMeasures, this.chkOverwrite, this.chkCopyVoices, this.chkCopyCasm].forEach((chk) => {
      chk.addEventListener('change', () => this.updateSummaryText());
    });

    // 確認按鈕
    this.btnConfirm.addEventListener('click', () => {
      this.handleConfirm();
    });
  }

  /**
   * 開啟彈窗
   */
  public open(
    targetParsed: YamahaFileParsed,
    onConfirm: (sourceParsed: YamahaFileParsed, srcSec: string, options: CrossStyleImportOptions) => void
  ) {
    this.targetParsed = targetParsed;
    this.onConfirmCallback = onConfirm;

    this.backdropEl.style.display = 'flex';

    if (this.externalParsed) {
      this.populateSectionsAndChannels();
    } else {
      this.btnConfirm.disabled = true;
      this.summaryTextEl.innerHTML = `<span style="color: #94a3b8;">請先點擊上方載入外部 STY 伴奏檔案...</span>`;
    }
  }

  /**
   * 載入並解析外部檔案
   */
  public async loadExternalFile(file: File) {
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const parsed = YamahaParser.parse(bytes, 'STY');

      const musical = StyleRemixer.getMusicalSections(parsed);
      if (musical.length === 0) {
        alert(`外部檔案 [${file.name}] 中查無任何有效音樂段落 (Marker)！`);
        return;
      }

      this.externalParsed = parsed;
      this.externalFileName = file.name;

      // 呈現檔案摘要標籤
      const ppq = parsed.division || 480;
      const isSff2 = parsed.tracks.some((t) =>
        t.events.some((e) => e.channel !== undefined && e.channel >= 8 && e.channel <= 15)
      );
      this.fileSummaryBadge.style.display = 'block';
      this.fileSummaryBadge.innerHTML = `
        ✅ <strong>${file.name}</strong> 載入成功 ｜ 格式: ${isSff2 ? 'SFF2' : 'SFF1'} ｜ 時間解析度: <strong>${ppq} PPQ</strong> ｜ 包含 <strong>${musical.length}</strong> 個段落
      `;

      // 解鎖段落路由與聲部區域
      const routeCard = this.backdropEl.querySelector('#si-route-card') as HTMLElement;
      const chCard = this.backdropEl.querySelector('#si-channels-card') as HTMLElement;
      if (routeCard) {
        routeCard.style.opacity = '1';
        routeCard.style.pointerEvents = 'auto';
      }
      if (chCard) {
        chCard.style.opacity = '1';
        chCard.style.pointerEvents = 'auto';
      }

      this.populateSectionsAndChannels();
    } catch (err: any) {
      alert(`載入外部 STY 伴奏失敗: ${err.message || '檔案格式損毀'}`);
    }
  }

  /**
   * 填充來源/目標段落與聲部卡片
   */
  public populateSectionsAndChannels() {
    if (!this.externalParsed || !this.targetParsed) return;

    const extMusical = StyleRemixer.getMusicalSections(this.externalParsed);
    const targetMusical = StyleRemixer.getMusicalSections(this.targetParsed);

    // 1. 填充來源段落下拉選單
    this.selectSourceSec.innerHTML = '';
    extMusical.forEach((sec) => {
      const range = StyleRemixer.getSectionTickRange(this.externalParsed!, sec.name);
      const bars = range?.measureCount ?? 1;
      let totalNotes = 0;
      for (let ch = 0; ch <= 15; ch++) {
        totalNotes += StyleRemixer.countNotesInChannel(this.externalParsed!, range!.startTick, range!.endTick, ch);
      }
      const opt = document.createElement('option');
      opt.value = sec.name;
      opt.textContent = `${sec.name} (${bars} 小節, ${totalNotes} 顆音符)`;
      this.selectSourceSec.appendChild(opt);
    });

    // 2. 填充目標段落下拉選單 (現有段落 ＋ 擴充全新段落)
    this.selectTargetSec.innerHTML = '';

    // 群組 1: 現有段落
    const groupExisting = document.createElement('optgroup');
    groupExisting.label = '📋 覆蓋目前風格現有段落';
    targetMusical.forEach((sec) => {
      const range = StyleRemixer.getSectionTickRange(this.targetParsed!, sec.name);
      const opt = document.createElement('option');
      opt.value = sec.name;
      opt.textContent = `${sec.name} (${range?.measureCount ?? 1} 小節)`;
      groupExisting.appendChild(opt);
    });
    this.selectTargetSec.appendChild(groupExisting);

    // 群組 2: 擴充全新段落
    const existingNamesLower = targetMusical.map((s) => s.name.trim().toLowerCase());
    const unusedSections = ALL_STANDARD_SECTIONS.filter(
      (s) => !existingNamesLower.includes(s.name.trim().toLowerCase())
    );

    if (unusedSections.length > 0) {
      const groupNew = document.createElement('optgroup');
      groupNew.label = '➕ 擴充為全新段落 (自動建立)';
      unusedSections.forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s.name;
        opt.textContent = `➕ ${s.name} (${s.label} - 建議 ${s.defaultBars} 小節)`;
        groupNew.appendChild(opt);
      });
      this.selectTargetSec.appendChild(groupNew);
    }

    // 智慧預選目標段落
    const firstSrc = this.selectSourceSec.value;
    const matchExisting = targetMusical.find((s) => s.name.toLowerCase() === firstSrc.toLowerCase());
    if (matchExisting) {
      this.selectTargetSec.value = matchExisting.name;
    } else if (this.selectTargetSec.options.length > 0) {
      this.selectTargetSec.selectedIndex = 0;
    }

    // 3. 渲染聲部卡片
    this.refreshChannelCards();
    this.updateSummaryText();
    this.btnConfirm.disabled = false;
  }

  /**
   * 刷新聲部卡片與音符計數
   */
  public refreshChannelCards() {
    if (!this.externalParsed) return;
    const srcSec = this.selectSourceSec.value;
    const range = StyleRemixer.getSectionTickRange(this.externalParsed, srcSec);
    if (!range) return;

    this.channelsGrid.innerHTML = '';

    YAMAHA_PARTS_INFO.forEach((meta) => {
      const ch = meta.channel;
      // 解析來源段落對應的 MIDI Channel
      let srcMidiCh = ch;
      const srcSecLower = srcSec.trim().toLowerCase();
      const srcCasmMap = this.externalParsed!.casmMappings?.[srcSecLower]
        || this.externalParsed!.casmMappings?.[srcSecLower.replace(/\s+/g, '')];
      if (srcCasmMap) {
        for (const [srcStr, dst] of Object.entries(srcCasmMap)) {
          if (dst === ch) {
            srcMidiCh = parseInt(srcStr, 10);
            break;
          }
        }
      }

      let noteCount = StyleRemixer.countNotesInChannel(this.externalParsed!, range.startTick, range.endTick, srcMidiCh);
      if (noteCount === 0 && srcMidiCh !== ch) {
        noteCount = StyleRemixer.countNotesInChannel(this.externalParsed!, range.startTick, range.endTick, ch);
      }
      if (noteCount === 0) {
        const fallbackCh = StyleRemixer.resolveSourceChannel(this.externalParsed!, srcSec, meta.partId);
        if (fallbackCh !== ch && fallbackCh !== srcMidiCh) {
          noteCount = StyleRemixer.countNotesInChannel(this.externalParsed!, range.startTick, range.endTick, fallbackCh);
        }
      }

      // 音色名稱推斷
      const override = StyleRemixer.getSectionChannelOverride(this.externalParsed!, range.startTick, range.endTick, srcMidiCh);
      const partInfo = this.externalParsed!.parts.find((p) => p.channel === srcMidiCh || p.channel === ch);
      const pc = override?.pc ?? partInfo?.programChange ?? DEFAULT_STYLE_PARTS[meta.partId]?.pc ?? 0;
      const isDrum = meta.channel === 8 || meta.channel === 9;
      const voiceDesc = isDrum ? `Drum Kit (PC ${pc})` : `Instrument (PC ${pc})`;

      const card = document.createElement('div');
      card.className = `si-channel-item ${noteCount > 0 ? 'is-checked' : 'is-empty'}`;
      card.dataset.channel = ch.toString();

      card.innerHTML = `
        <label class="si-channel-label">
          <input type="checkbox" class="si-ch-checkbox" data-channel="${ch}" ${noteCount > 0 ? 'checked' : ''}>
          <div class="si-ch-info">
            <div class="si-ch-title" style="color: ${meta.color};">
              <span>${meta.icon}</span>
              <span>${meta.label}</span>
            </div>
            <div class="si-ch-voice">${voiceDesc}</div>
          </div>
          <span class="si-ch-count ${noteCount > 0 ? 'has-notes' : ''}">${noteCount > 0 ? `${noteCount} 顆音符` : '無音符'}</span>
        </label>
      `;

      const chk = card.querySelector('.si-ch-checkbox') as HTMLInputElement;
      chk.addEventListener('change', () => {
        card.classList.toggle('is-checked', chk.checked);
        this.updateSummaryText();
      });

      this.channelsGrid.appendChild(card);
    });
  }

  /**
   * 快捷聲部篩選切換
   */
  public setChannelPreset(preset: 'all' | 'rb' | 'chord') {
    const checkboxes = this.channelsGrid.querySelectorAll('.si-ch-checkbox') as NodeListOf<HTMLInputElement>;
    checkboxes.forEach((chk) => {
      const ch = parseInt(chk.dataset.channel || '0', 10);
      const meta = YAMAHA_PARTS_INFO.find((p) => p.channel === ch);
      if (!meta) return;

      if (preset === 'all') chk.checked = true;
      else if (preset === 'rb') chk.checked = (meta.group === 'rhythm' || meta.group === 'bass');
      else if (preset === 'chord') chk.checked = (meta.group === 'chord' || meta.group === 'phrase');

      const parent = chk.closest('.si-channel-item');
      parent?.classList.toggle('is-checked', chk.checked);
    });

    this.updateSummaryText();
  }

  /**
   * 取得已勾選的目標通道
   */
  public getSelectedChannels(): number[] {
    const checkboxes = this.channelsGrid.querySelectorAll('.si-ch-checkbox:checked') as NodeListOf<HTMLInputElement>;
    return Array.from(checkboxes).map((c) => parseInt(c.dataset.channel || '0', 10));
  }

  /**
   * 更新底部總結說明文字
   */
  public updateSummaryText() {
    if (!this.externalParsed || !this.targetParsed) {
      this.summaryTextEl.innerHTML = `請先載入外部 STY 伴奏檔案...`;
      this.btnConfirm.disabled = true;
      return;
    }

    const srcSec = this.selectSourceSec.value;
    const targetSec = this.selectTargetSec.value;
    const selectedChs = this.getSelectedChannels();

    if (selectedChs.length === 0) {
      this.summaryTextEl.innerHTML = `<span style="color: #f59e0b;">請至少勾選 1 個欲移植的伴奏聲部。</span>`;
      this.btnConfirm.disabled = true;
      return;
    }

    const srcPpq = this.externalParsed.division || 480;
    const targetPpq = this.targetParsed.division || 1920;
    const ppqText = srcPpq !== targetPpq
      ? ` ｜ 自動執行 <strong style="color: #38bdf8;">${srcPpq} ➔ ${targetPpq} PPQ</strong> 時間軸縮放`
      : '';

    const isTargetNew = !this.targetParsed.sections.some((s) => s.name.toLowerCase() === targetSec.toLowerCase());
    const actionText = isTargetNew
      ? `將為目前風格【全新擴充段落】「<strong>${targetSec}</strong>」`
      : `即將移植並覆蓋目前風格的「<strong>${targetSec}</strong>」`;

    this.summaryTextEl.innerHTML = `
      即將從【<strong>${this.externalFileName}</strong>】的【<strong>${srcSec}</strong>】移植 <strong>${selectedChs.length}</strong> 個聲部至【<strong>${targetSec}</strong>】。<br>
      <span style="font-size: 0.8rem; color: #94a3b8;">${actionText}${ppqText} ｜ 自動歸一化至 SFF2 Arranger 通道 (CH 9~16)。</span>
    `;

    this.btnConfirm.disabled = false;
  }

  /**
   * 點擊確認移植
   */
  private handleConfirm() {
    if (!this.externalParsed || !this.targetParsed) return;

    const srcSec = this.selectSourceSec.value;
    const targetSec = this.selectTargetSec.value;
    const channels = this.getSelectedChannels();

    if (channels.length === 0) {
      alert('請至少勾選 1 個欲移植的伴奏聲部！');
      return;
    }

    const options: CrossStyleImportOptions = {
      targetSection: targetSec,
      channels,
      matchMeasures: this.chkMatchMeasures.checked,
      overwrite: this.chkOverwrite.checked,
      copyVoices: this.chkCopyVoices.checked,
      copyCasm: this.chkCopyCasm.checked,
    };

    this.close();

    if (this.onConfirmCallback) {
      this.onConfirmCallback(this.externalParsed, srcSec, options);
    }
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

  public getExternalParsed(): YamahaFileParsed | null {
    return this.externalParsed;
  }
}
