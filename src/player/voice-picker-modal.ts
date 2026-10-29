/**
 * Yamaha PSR-SX920 完整原廠音色搜尋與選擇器 (Voice Picker Modal)
 * 專為單軌聚焦工作台與 8 軌伴奏混音台量身打造的專業音色彈窗工作台
 * 具備：
 *  - 2,300+ 款 Yamaha 原廠全套音色庫 (PSR-SX920 官方 Data List)
 *  - 16 大官方分類標籤導航 (鋼琴、電鋼琴、弦樂、吉他、貝斯、薩克斯、銅管、鼓組...)
 *  - 6 大音色類型快速篩選 (S.Art! 超音色、Live!/Sweet!/Cool!、MegaVoice 伴奏、鼓組、推薦、警示)
 *  - 毫秒級即時關鍵字模糊搜尋 (支援中英文名稱、分類、MSB/LSB/PC 代碼)
 *  - 單鍵試聽樂器示範樂句 (Audition Phrase) 與即時發送琴端 MIDI Program Change
 *  - 雙擊卡牌或點擊確認立即換音色，無縫回寫 STY 結構並支援復原
 */

import {
  type YamahaVoice,
  type VoiceCategory,
  type VoiceSuitabilityFilter,
  VOICE_CATEGORIES,
  VOICE_SUITABILITY_FILTERS,
  searchYamahaVoices,
  findYamahaVoice,
} from '../core/data/yamaha-voices';
import { styPlaybackEngine, type PartVoiceInfo } from './sty-playback-engine';

export class VoicePickerModal {
  private backdropEl!: HTMLElement;
  private searchInput!: HTMLInputElement;
  private clearSearchBtn!: HTMLElement;
  private categoryListEl!: HTMLElement;
  private filterPillsEl!: HTMLElement;
  private voiceGridEl!: HTMLElement;
  private resultsCountEl!: HTMLElement;
  private btnLoadMore!: HTMLButtonElement;
  private targetTrackBadge!: HTMLElement;
  private footerSelectedInfo!: HTMLElement;
  private btnAuditionCurrent!: HTMLButtonElement;
  private btnConfirmApply!: HTMLButtonElement;
  private btnCancel!: HTMLButtonElement;
  private btnCloseHeader!: HTMLButtonElement;

  private currentChannel: number = 8;
  private selectedVoice: YamahaVoice | null = null;
  private onSelectCallback: ((channel: number, voice: YamahaVoice) => void) | null = null;

  // 篩選與分頁狀態
  private activeCategory: VoiceCategory | 'ALL' = 'ALL';
  private activeSuitability: VoiceSuitabilityFilter = 'ALL';
  private currentResults: YamahaVoice[] = [];
  private displayedCount: number = 60;
  private pageSize: number = 60;
  private searchDebounceTimer: any = null;

  constructor() {
    this.createDOM();
    this.bindEvents();
  }

  /**
   * 建置 Modal DOM 結構並掛載至 body
   */
  private createDOM() {
    const wrap = document.createElement('div');
    wrap.id = 'voice-picker-backdrop';
    wrap.className = 'voice-picker-backdrop';
    wrap.style.display = 'none';

    wrap.innerHTML = `
      <div class="voice-picker-modal" role="dialog" aria-modal="true" aria-labelledby="vp-title">
        <!-- 頂部標題列 -->
        <div class="voice-picker-header">
          <div class="vp-header-left">
            <h2 id="vp-title" class="vp-title">🎹 Yamaha 原廠音色庫 (Voice Picker)</h2>
            <span id="vp-target-track" class="vp-target-badge">聲部: CH 9 - Rhythm 1</span>
          </div>
          <button id="vp-btn-close-header" class="vp-close-btn" title="關閉 (Esc)">✕</button>
        </div>

        <!-- 搜尋與類型快篩列 -->
        <div class="voice-picker-filter-bar">
          <div class="vp-search-box">
            <span class="vp-search-icon">🔍</span>
            <input type="text" id="vp-search-input" class="vp-search-input" placeholder="搜尋 2,300+ 音色名稱 (如 CFX, Kino, Distortion, RealBass...) 或 MSB/PC..." autocomplete="off">
            <button id="vp-btn-clear-search" class="vp-clear-search-btn" title="清除搜尋" style="display:none;">✕</button>
          </div>
          <div id="vp-filter-pills" class="vp-filter-pills">
            <!-- 動態插入 Suitability Filters -->
          </div>
        </div>

        <!-- 中間主體：左側分類導航 ＋ 右側音色卡牌網格 -->
        <div class="voice-picker-body">
          <!-- 左側樂器分類側欄 -->
          <div id="vp-category-list" class="vp-category-sidebar">
            <!-- 動態插入 16 大官方分類標籤 -->
          </div>

          <!-- 右側音色列表 -->
          <div class="vp-content-area">
            <div class="vp-content-header">
              <span id="vp-results-count" class="vp-results-count">載入音色中...</span>
              <span class="vp-hint-tip">💡 點擊「▶ 試聽」聆聽示範樂句 ｜ 雙擊卡牌直接更換套用</span>
            </div>
            <div id="vp-voice-grid" class="vp-voice-grid">
              <!-- 動態渲染音色卡牌 -->
            </div>
            <div class="vp-load-more-wrap">
              <button id="vp-btn-load-more" class="vp-load-more-btn" style="display: none;">載入更多音色...</button>
            </div>
          </div>
        </div>

        <!-- 底部確認列 -->
        <div class="voice-picker-footer">
          <div id="vp-footer-selected-info" class="vp-footer-info">
            尚未選取音色
          </div>
          <div class="vp-footer-actions">
            <button id="vp-btn-audition-current" class="vp-action-btn btn-audition" disabled>🔊 試聽示範 (Audition)</button>
            <button id="vp-btn-cancel" class="vp-action-btn btn-cancel">取消</button>
            <button id="vp-btn-confirm" class="vp-action-btn btn-confirm" disabled>✔ 確認套用音色</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(wrap);

    // 參照快取
    this.backdropEl = wrap;
    this.searchInput = wrap.querySelector('#vp-search-input') as HTMLInputElement;
    this.clearSearchBtn = wrap.querySelector('#vp-btn-clear-search') as HTMLElement;
    this.categoryListEl = wrap.querySelector('#vp-category-list') as HTMLElement;
    this.filterPillsEl = wrap.querySelector('#vp-filter-pills') as HTMLElement;
    this.voiceGridEl = wrap.querySelector('#vp-voice-grid') as HTMLElement;
    this.resultsCountEl = wrap.querySelector('#vp-results-count') as HTMLElement;
    this.btnLoadMore = wrap.querySelector('#vp-btn-load-more') as HTMLButtonElement;
    this.targetTrackBadge = wrap.querySelector('#vp-target-track') as HTMLElement;
    this.footerSelectedInfo = wrap.querySelector('#vp-footer-selected-info') as HTMLElement;
    this.btnAuditionCurrent = wrap.querySelector('#vp-btn-audition-current') as HTMLButtonElement;
    this.btnConfirmApply = wrap.querySelector('#vp-btn-confirm') as HTMLButtonElement;
    this.btnCancel = wrap.querySelector('#vp-btn-cancel') as HTMLButtonElement;
    this.btnCloseHeader = wrap.querySelector('#vp-btn-close-header') as HTMLButtonElement;

    // 渲染分類與過濾標籤
    this.renderCategorySidebar();
    this.renderSuitabilityPills();
  }

  /**
   * 渲染左側 16 大官方分類導航
   */
  private renderCategorySidebar() {
    this.categoryListEl.innerHTML = '';
    VOICE_CATEGORIES.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = `vp-cat-btn ${cat.key === this.activeCategory ? 'active' : ''}`;
      btn.dataset.category = cat.key;
      btn.innerHTML = `<span class="vp-cat-icon">${cat.icon}</span><span class="vp-cat-label">${cat.label}</span>`;
      btn.addEventListener('click', () => {
        this.setCategory(cat.key);
      });
      this.categoryListEl.appendChild(btn);
    });
  }

  /**
   * 渲染音色類型快篩膠囊
   */
  private renderSuitabilityPills() {
    this.filterPillsEl.innerHTML = '';
    VOICE_SUITABILITY_FILTERS.forEach(f => {
      const btn = document.createElement('button');
      btn.className = `vp-pill-btn ${f.key === this.activeSuitability ? 'active' : ''}`;
      btn.dataset.filter = f.key;
      btn.innerHTML = `<span>${f.icon}</span> <span>${f.label}</span>`;
      btn.addEventListener('click', () => {
        this.setSuitabilityFilter(f.key);
      });
      this.filterPillsEl.appendChild(btn);
    });
  }

  /**
   * 綁定使用者交互事件
   */
  private bindEvents() {
    // 點擊背景關閉
    this.backdropEl.addEventListener('click', (e) => {
      if (e.target === this.backdropEl) {
        this.close();
      }
    });

    // 關閉與取消按鈕
    this.btnCloseHeader.addEventListener('click', () => this.close());
    this.btnCancel.addEventListener('click', () => this.close());

    // 鍵盤快捷鍵 (Esc 關閉)
    window.addEventListener('keydown', (e) => {
      if (this.isOpen() && e.key === 'Escape') {
        this.close();
      }
    });

    // 搜尋輸入框即時過濾
    this.searchInput.addEventListener('input', () => {
      const val = this.searchInput.value.trim();
      this.clearSearchBtn.style.display = val ? 'inline-flex' : 'none';
      if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = setTimeout(() => {
        this.performSearch();
      }, 35);
    });

    // 清除搜尋
    this.clearSearchBtn.addEventListener('click', () => {
      this.searchInput.value = '';
      this.clearSearchBtn.style.display = 'none';
      this.performSearch();
      this.searchInput.focus();
    });

    // 載入更多按鈕
    this.btnLoadMore.addEventListener('click', () => {
      this.displayedCount += this.pageSize;
      this.renderVoiceGrid(false);
    });

    // 試聽目前所選按鈕
    this.btnAuditionCurrent.addEventListener('click', () => {
      if (this.selectedVoice) {
        this.auditionVoice(this.selectedVoice);
      }
    });

    // 確認套用按鈕
    this.btnConfirmApply.addEventListener('click', () => {
      this.confirmSelection();
    });
  }

  /**
   * 設定目前分類並重新檢索
   */
  public setCategory(cat: VoiceCategory | 'ALL') {
    this.activeCategory = cat;
    this.categoryListEl.querySelectorAll('.vp-cat-btn').forEach(btn => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.category === cat);
    });
    this.performSearch();
  }

  /**
   * 設定類型篩選並重新檢索
   */
  public setSuitabilityFilter(filter: VoiceSuitabilityFilter) {
    this.activeSuitability = filter;
    this.filterPillsEl.querySelectorAll('.vp-pill-btn').forEach(btn => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.filter === filter);
    });
    this.performSearch();
  }

  /**
   * 執行搜尋運算
   */
  private performSearch() {
    const query = this.searchInput.value;
    this.currentResults = searchYamahaVoices(query, this.activeCategory, this.activeSuitability);
    this.displayedCount = this.pageSize;
    this.renderVoiceGrid(true);
  }

  /**
   * 渲染音色卡牌網格
   */
  private renderVoiceGrid(resetScroll: boolean = true) {
    if (resetScroll) {
      this.voiceGridEl.innerHTML = '';
      this.voiceGridEl.scrollTop = 0;
    }

    const total = this.currentResults.length;
    this.resultsCountEl.textContent = `共找到 ${total} 種音色${total > this.displayedCount ? ` (目前顯示前 ${this.displayedCount} 筆)` : ''}`;

    if (total === 0) {
      this.voiceGridEl.innerHTML = `
        <div class="vp-empty-state">
          <div class="vp-empty-icon">🔍</div>
          <div class="vp-empty-title">查無相符音色</div>
          <div class="vp-empty-desc">請嘗試更換分類、縮減關鍵字或切換為「全部類型」</div>
        </div>
      `;
      this.btnLoadMore.style.display = 'none';
      return;
    }

    const slice = this.currentResults.slice(0, this.displayedCount);
    // 清空重繪
    this.voiceGridEl.innerHTML = '';

    slice.forEach(v => {
      const card = document.createElement('div');
      const isSelected = this.selectedVoice && (this.selectedVoice.msb === v.msb && this.selectedVoice.lsb === v.lsb && this.selectedVoice.pc === v.pc);
      card.className = `voice-card ${isSelected ? 'is-selected' : ''}`;
      card.dataset.msb = v.msb.toString();
      card.dataset.lsb = v.lsb.toString();
      card.dataset.pc = v.pc.toString();

      // 類型標籤
      let typeBadge = '';
      if (v.type === 'S.Art!') typeBadge = `<span class="vp-type-tag type-sart">S.Art!</span>`;
      else if (v.type === 'MegaVoice') typeBadge = `<span class="vp-type-tag type-mega">MegaVoice</span>`;
      else if (v.type === 'Live!') typeBadge = `<span class="vp-type-tag type-live">Live!</span>`;
      else if (v.type === 'Sweet!') typeBadge = `<span class="vp-type-tag type-sweet">Sweet!</span>`;
      else if (v.type === 'Cool!') typeBadge = `<span class="vp-type-tag type-cool">Cool!</span>`;
      else if (v.category === 'Drums' || v.category === 'Percussion') typeBadge = `<span class="vp-type-tag type-drums">Kit</span>`;

      // 推薦星號
      const recStar = v.suitability === 'recommended' ? '<span class="vp-rec-star" title="官方推薦優選音色">⭐</span>' : '';

      card.innerHTML = `
        <div class="vc-top-row">
          <span class="vc-category-pill">${v.category}</span>
          ${typeBadge}
          ${recStar}
          <span class="vc-specs">M:${v.msb} L:${v.lsb} PC:${v.pc + 1}</span>
        </div>
        <div class="vc-name" title="${v.name}">${v.name}</div>
        <div class="vc-chinese-name">${v.chineseName || ''}</div>
        <div class="vc-bottom-actions">
          <button class="vc-btn-audition" title="試聽示範樂句">▶ 試聽</button>
          <button class="vc-btn-select" title="選取此音色">選取</button>
        </div>
      `;

      // 單擊卡牌：選中此音色
      card.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('vc-btn-audition')) {
          e.stopPropagation();
          this.auditionVoice(v);
          return;
        }
        this.selectVoice(v);
      });

      // 雙擊卡牌：直接選取並套用確認！
      card.addEventListener('dblclick', () => {
        this.selectVoice(v);
        this.confirmSelection();
      });

      this.voiceGridEl.appendChild(card);
    });

    // 載入更多按鈕顯示控制
    if (this.displayedCount < total) {
      this.btnLoadMore.style.display = 'block';
      this.btnLoadMore.textContent = `載入更多音色 (還有 ${total - this.displayedCount} 筆)...`;
    } else {
      this.btnLoadMore.style.display = 'none';
    }
  }

  /**
   * 選定特定音色卡牌
   */
  private selectVoice(voice: YamahaVoice) {
    this.selectedVoice = voice;

    // 更新 DOM is-selected 樣式
    this.voiceGridEl.querySelectorAll('.voice-card').forEach(el => {
      const m = parseInt((el as HTMLElement).dataset.msb || '-1', 10);
      const l = parseInt((el as HTMLElement).dataset.lsb || '-1', 10);
      const p = parseInt((el as HTMLElement).dataset.pc || '-1', 10);
      const match = m === voice.msb && l === voice.lsb && p === voice.pc;
      el.classList.toggle('is-selected', match);
    });

    // 更新 Footer
    this.btnConfirmApply.disabled = false;
    this.btnAuditionCurrent.disabled = false;
    const chName = voice.chineseName ? ` (${voice.chineseName})` : '';
    this.footerSelectedInfo.innerHTML = `
      <span>已選取：<b>${voice.name}${chName}</b></span>
      <span class="vp-footer-specs">【分類: ${voice.category} ｜ Bank MSB: ${voice.msb}, LSB: ${voice.lsb}, PC: ${voice.pc + 1}】</span>
    `;
  }

  /**
   * 試聽音色示範樂句
   */
  private auditionVoice(voice: YamahaVoice) {
    styPlaybackEngine.previewVoicePhrase(this.currentChannel, voice);
  }

  /**
   * 確認選取並回傳通知
   */
  private confirmSelection() {
    if (!this.selectedVoice) return;
    if (this.onSelectCallback) {
      this.onSelectCallback(this.currentChannel, this.selectedVoice);
    }
    this.close();
  }

  /**
   * 開啟音色選擇器彈窗
   */
  public open(
    channel: number,
    partLabel: string,
    currentVoice: PartVoiceInfo | null,
    onSelect: (channel: number, voice: YamahaVoice) => void
  ) {
    this.currentChannel = channel;
    this.onSelectCallback = onSelect;

    // 更新標題聲部標籤
    this.targetTrackBadge.textContent = `目標聲部: CH ${channel + 1} - ${partLabel}`;

    // 依據聲部性質智慧預選最適分類
    if (channel === 8 || channel === 9) {
      this.activeCategory = 'Drums';
    } else if (channel === 10) {
      this.activeCategory = 'Bass';
    } else if (currentVoice?.category) {
      const foundCat = VOICE_CATEGORIES.find(c => c.key.toLowerCase() === currentVoice.category.toLowerCase());
      this.activeCategory = foundCat ? foundCat.key : 'ALL';
    } else {
      this.activeCategory = 'ALL';
    }

    this.activeSuitability = 'ALL';
    this.searchInput.value = '';
    this.clearSearchBtn.style.display = 'none';

    // 尋找目前已選取音色
    if (currentVoice) {
      this.selectedVoice = findYamahaVoice(currentVoice.msb, currentVoice.lsb, currentVoice.pc) || null;
    } else {
      this.selectedVoice = null;
    }

    if (this.selectedVoice) {
      this.selectVoice(this.selectedVoice);
    } else {
      this.footerSelectedInfo.textContent = '請點選欲更換的 Yamaha 原廠音色';
      this.btnConfirmApply.disabled = true;
      this.btnAuditionCurrent.disabled = true;
    }

    // 重新設定分類側欄樣式
    this.categoryListEl.querySelectorAll('.vp-cat-btn').forEach(btn => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.category === this.activeCategory);
    });
    this.filterPillsEl.querySelectorAll('.vp-pill-btn').forEach(btn => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.filter === this.activeSuitability);
    });

    // 執行搜尋與渲染
    this.performSearch();

    // 顯示 Modal
    this.backdropEl.style.display = 'flex';
    setTimeout(() => {
      this.searchInput.focus();
    }, 50);
  }

  /**
   * 關閉音色選擇器彈窗
   */
  public close() {
    this.backdropEl.style.display = 'none';
  }

  public isOpen(): boolean {
    return this.backdropEl.style.display === 'flex';
  }
}
