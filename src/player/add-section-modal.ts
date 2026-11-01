/**
 * Yamaha STY 新增伴奏段落彈窗 (Add Section Modal)
 * 提供乾淨防呆的視覺化選單，讓使用者能一鍵為當前 STY 伴奏檔追加
 * Yamaha 標準段落 (如 Main C, Main D, Fill In BB, Intro A 等)，
 * 並自動配置 SFF2 1920 PPQ 時間軸與標準 CASM 伴奏轉換規則。
 */

import type { YamahaFileParsed } from '../core/models/types';
import { StyleRemixer } from '../core/writer/style-remixer';
import { ALL_STANDARD_SECTIONS } from '../core/models/style-types';

export interface AddSectionConfig {
  sectionName: string;
  bars: number;
  pilotBeat: boolean;
}

export class AddSectionModal {
  private backdropEl!: HTMLElement;
  private selectSection!: HTMLSelectElement;
  private inputBars!: HTMLInputElement;
  private chkPilotBeat!: HTMLInputElement;
  private summaryTextEl!: HTMLElement;
  private btnConfirm!: HTMLButtonElement;
  private btnCancel!: HTMLButtonElement;
  private btnCloseHeader!: HTMLButtonElement;
  private quickBarBtns: HTMLButtonElement[] = [];

  private currentParsed: YamahaFileParsed | null = null;
  private onConfirmCallback: ((config: AddSectionConfig) => void) | null = null;

  constructor() {
    this.createDOM();
    this.bindEvents();
  }

  /**
   * 建立 Modal DOM 結構並掛載至 document.body
   */
  private createDOM() {
    const wrap = document.createElement('div');
    wrap.id = 'add-section-backdrop';
    wrap.className = 'add-section-backdrop';
    wrap.style.display = 'none';

    wrap.innerHTML = `
      <div class="add-section-modal" role="dialog" aria-modal="true" aria-labelledby="as-modal-title">
        <!-- 頂部標題列 -->
        <div class="as-modal-header">
          <div class="as-header-left">
            <h2 id="as-modal-title" class="as-modal-title">➕ 新增伴奏段落 (Add Section)</h2>
            <span class="as-header-badge">Yamaha SFF2 原廠規格</span>
          </div>
          <button id="as-btn-close-header" class="as-close-btn" title="關閉 (Esc)">✕</button>
        </div>

        <!-- 主體內容 -->
        <div class="as-modal-body">
          <!-- 區塊 1: 選擇欲新增之段落 -->
          <div class="as-card">
            <div class="as-card-title">1. 選擇欲追加之 Yamaha 標準段落</div>
            <div class="as-form-group">
              <label class="as-label" for="as-select-section">伴奏段落 (Section):</label>
              <select id="as-select-section" class="as-select"></select>
              <span class="as-hint">自動過濾目前風格已存在的段落，防止名稱重複或輸入拼寫錯誤。</span>
            </div>
          </div>

          <!-- 區塊 2: 小節長度設定 -->
          <div class="as-card">
            <div class="as-card-title">2. 段落小節長度 (Measure Count)</div>
            <div class="as-form-group">
              <div class="as-bars-row">
                <div class="as-quick-bars" id="as-quick-bars">
                  <button type="button" class="as-btn-bar" data-bars="1">1 小節</button>
                  <button type="button" class="as-btn-bar" data-bars="2">2 小節</button>
                  <button type="button" class="as-btn-bar" data-bars="4">4 小節</button>
                  <button type="button" class="as-btn-bar" data-bars="8">8 小節</button>
                </div>
                <div class="as-custom-bar-wrap">
                  <input type="number" id="as-input-bars" class="as-input-bars" min="1" max="32" value="4">
                  <span class="as-bar-unit">小節</span>
                </div>
              </div>
              <span class="as-hint">過門 (Fill In) 通常為 1 小節；主奏 (Main) 與前奏 (Intro) 通常為 4 或 8 小節。</span>
            </div>
          </div>

          <!-- 區塊 3: 導引拍與伴奏設定 -->
          <div class="as-card">
            <div class="as-card-title">3. 錄音輔助與導引拍</div>
            <div class="as-form-group">
              <label class="as-checkbox-label">
                <input type="checkbox" id="as-chk-pilot" checked>
                <span>🥁 自動在 CH 10 (Rhythm 2) 產生 4 拍標準導引鼓點 (大鼓/小鼓/Hi-Hat)</span>
              </label>
              <span class="as-hint">提供您在單軌鍵盤錄音時清晰的節奏指引，錄製完成後可隨時在單軌編輯器中清除或覆蓋。</span>
            </div>
          </div>

          <!-- 摘要提示 -->
          <div id="as-summary-text" class="as-summary-box">
            準備新增段落...
          </div>
        </div>

        <!-- 底部動作按鈕 -->
        <div class="as-modal-footer">
          <button id="as-btn-cancel" class="as-btn-secondary">取消</button>
          <button id="as-btn-confirm" class="as-btn-primary">✨ 確認新增段落</button>
        </div>
      </div>
    `;

    document.body.appendChild(wrap);

    // 參照快取
    this.backdropEl = wrap;
    this.selectSection = wrap.querySelector('#as-select-section') as HTMLSelectElement;
    this.inputBars = wrap.querySelector('#as-input-bars') as HTMLInputElement;
    this.chkPilotBeat = wrap.querySelector('#as-chk-pilot') as HTMLInputElement;
    this.summaryTextEl = wrap.querySelector('#as-summary-text') as HTMLElement;
    this.btnConfirm = wrap.querySelector('#as-btn-confirm') as HTMLButtonElement;
    this.btnCancel = wrap.querySelector('#as-btn-cancel') as HTMLButtonElement;
    this.btnCloseHeader = wrap.querySelector('#as-btn-close-header') as HTMLButtonElement;
    this.quickBarBtns = Array.from(wrap.querySelectorAll('.as-btn-bar')) as HTMLButtonElement[];
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
      if (this.isOpen()) {
        if (e.key === 'Escape') this.close();
        else if (e.key === 'Enter' && (e.target as HTMLElement)?.tagName !== 'TEXTAREA') {
          this.handleConfirm();
        }
      }
    });

    // 段落下拉選單切換時，自動帶入該段落之推薦小節數與導引拍配置
    this.selectSection.addEventListener('change', () => {
      this.handleSectionChange();
    });

    // 快捷小節按鈕點擊
    this.quickBarBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const bars = parseInt(btn.dataset.bars || '4', 10);
        this.inputBars.value = bars.toString();
        this.updateQuickBarActiveState(bars);
        this.updateSummaryText();
      });
    });

    // 自訂小節數輸入變更
    this.inputBars.addEventListener('input', () => {
      const bars = parseInt(this.inputBars.value, 10);
      this.updateQuickBarActiveState(bars);
      this.updateSummaryText();
    });

    // 導引拍勾選變更
    this.chkPilotBeat.addEventListener('change', () => {
      this.updateSummaryText();
    });

    // 確認按鈕
    this.btnConfirm.addEventListener('click', () => {
      this.handleConfirm();
    });
  }

  /**
   * 開啟彈窗並根據當前 STY 動態填充未擁有的段落
   */
  public open(
    parsed: YamahaFileParsed,
    onConfirm: (config: AddSectionConfig) => void
  ) {
    this.currentParsed = parsed;
    this.onConfirmCallback = onConfirm;

    const musical = StyleRemixer.getMusicalSections(parsed);
    const existingLower = musical.map(s => s.name.trim().toLowerCase());

    // 篩選出目前 STY 中尚未建立的 Yamaha 標準段落
    const available = ALL_STANDARD_SECTIONS.filter(
      s => !existingLower.includes(s.name.trim().toLowerCase())
    );

    this.selectSection.innerHTML = '';

    if (available.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '此伴奏已擁有全部 15 個 Yamaha 標準段落';
      opt.disabled = true;
      this.selectSection.appendChild(opt);
      this.btnConfirm.disabled = true;
      this.summaryTextEl.innerHTML = `<span style="color: #f59e0b;">已達到 Yamaha STY 最大標準段落容量 (15 段落)。</span>`;
    } else {
      this.btnConfirm.disabled = false;
      available.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.name;
        opt.textContent = `${s.name} (${s.label} - 建議 ${s.defaultBars} 小節)`;
        this.selectSection.appendChild(opt);
      });

      // 智慧預選：優先選取 Main C, Main D, Fill In BB, 或第一個可用段落
      const priorityNames = ['Main C', 'Main D', 'Fill In BB', 'Fill In CC', 'Intro A', 'Ending B'];
      const preferred = available.find(a => priorityNames.includes(a.name)) || available[0];
      this.selectSection.value = preferred.name;
      this.handleSectionChange();
    }

    this.backdropEl.style.display = 'flex';
  }

  /**
   * 段落選單變更處理
   */
  private handleSectionChange() {
    const secName = this.selectSection.value;
    const info = ALL_STANDARD_SECTIONS.find(s => s.name.toLowerCase() === secName.toLowerCase());
    if (info) {
      this.inputBars.value = info.defaultBars.toString();
      this.updateQuickBarActiveState(info.defaultBars);
      // Main 段落預設勾選導引拍，Fill In / Intro / Ending 預設依使用者喜好或關閉
      this.chkPilotBeat.checked = (info.category === 'Main');
    }
    this.updateSummaryText();
  }

  /**
   * 更新快捷小節按鈕 active 樣式
   */
  private updateQuickBarActiveState(currentBars: number) {
    this.quickBarBtns.forEach((btn) => {
      const b = parseInt(btn.dataset.bars || '0', 10);
      btn.classList.toggle('active', b === currentBars);
    });
  }

  /**
   * 更新底部總結說明文字
   */
  private updateSummaryText() {
    const secName = this.selectSection.value;
    const bars = parseInt(this.inputBars.value, 10) || 4;
    const pilot = this.chkPilotBeat.checked;

    if (!secName) {
      this.summaryTextEl.innerHTML = `<span style="color: #f43f5e;">請選擇欲新增的段落。</span>`;
      return;
    }

    const pilotBadge = pilot
      ? `<span style="color: #34d399;">已啟用 CH 10 導引拍</span>`
      : `<span style="color: #94a3b8;">完全空白樂譜</span>`;

    this.summaryTextEl.innerHTML = `
      即將在風格中【全新建立】伴奏段落「<strong>${secName}</strong>」，長度為 <strong>${bars} 小節</strong>。<br>
      <span style="font-size: 0.8rem; color: #94a3b8;">狀態：${pilotBadge} ｜ 自動注入 Yamaha SFF2 CASM 伴奏轉調規則 (CH 9~16 直通)。</span>
    `;
  }

  /**
   * 點擊確認新增
   */
  private handleConfirm() {
    const secName = this.selectSection.value.trim();
    if (!secName) {
      alert('請先選擇欲新增之伴奏段落！');
      return;
    }

    const bars = parseInt(this.inputBars.value, 10);
    if (isNaN(bars) || bars < 1 || bars > 32) {
      alert('小節數請輸入 1 至 32 之間的有效數字！');
      this.inputBars.focus();
      return;
    }

    const config: AddSectionConfig = {
      sectionName: secName,
      bars,
      pilotBeat: this.chkPilotBeat.checked,
    };

    this.close();

    if (this.onConfirmCallback) {
      this.onConfirmCallback(config);
    }
  }

  /**
   * 關閉彈窗
   */
  public close() {
    this.backdropEl.style.display = 'none';
  }

  public getCurrentParsed(): YamahaFileParsed | null {
    return this.currentParsed;
  }

  public isOpen(): boolean {
    return this.backdropEl.style.display !== 'none';
  }
}
