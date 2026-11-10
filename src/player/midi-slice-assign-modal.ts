/**
 * MIDI 小節切片指派至 Yamaha 伴奏段落確認彈窗 (Midi Slice Assign Modal)
 * 允許使用者選定目前播放區間 (如第 1~4 小節)，自訂目標伴奏段落 (如 Main A, Intro A, Fill In 等)，
 * 並一覽 8 大伴奏聲部的樂器配置與排除的主旋律，確認後即可交由後續切片裝配引擎執行裁切與段落封裝。
 */

import {
  MidiPartAssignMatrix,
  YAMAHA_ARRANGER_PARTS,
  type SongPartMappingPlan,
  type YamahaPartType
} from '../core/writer/midi-part-assign-matrix';
import type { MidiSongAnalysis } from '../core/parser/midi-song-analyzer';
import type { YamahaFileParsed } from '../core/models/types';
import { ALL_STANDARD_SECTIONS } from '../core/models/style-types';

export interface MidiSliceAssignConfig {
  startBar: number;
  endBar: number;
  totalBars: number;
  targetSection: string;       // e.g. 'Main A', 'Intro A'
  mappingPlan: SongPartMappingPlan;
  normalizeChordsToC: boolean;
}

export class MidiSliceAssignModal {
  private backdropEl!: HTMLElement;
  private selectSectionEl!: HTMLSelectElement;
  private rangeBadgeEl!: HTMLElement;
  private gridContainerEl!: HTMLElement;
  private melodyBoxEl!: HTMLElement;
  private btnConfirm!: HTMLButtonElement;
  private btnCancel!: HTMLButtonElement;
  private btnCloseHeader!: HTMLButtonElement;
  private btnAuditionAccomp!: HTMLButtonElement;
  private chkNormalizeChords!: HTMLInputElement;
  private normDescEl!: HTMLElement;
  private normLabelEl!: HTMLElement;

  private currentAnalysis: MidiSongAnalysis | null = null;
  private currentPlan: SongPartMappingPlan | null = null;
  private currentStartBar: number = 1;
  private currentEndBar: number = 4;
  private currentSourceParsed?: YamahaFileParsed;
  private onConfirmCallback: ((config: MidiSliceAssignConfig) => void) | null = null;

  public getCurrentSourceParsed(): YamahaFileParsed | undefined {
    return this.currentSourceParsed;
  }
  private onAuditionCallback: ((isSoloAccomp: boolean, excludedChannels: number[]) => void) | null = null;
  private isAuditioningAccomp: boolean = false;

  constructor() {
    this.createDOM();
    this.bindEvents();
  }

  private createDOM() {
    const wrap = document.createElement('div');
    wrap.id = 'midi-slice-modal-backdrop';
    wrap.className = 'add-section-backdrop';
    wrap.style.display = 'none';

    wrap.innerHTML = `
      <div class="add-section-modal" style="max-width: 820px;" role="dialog" aria-modal="true" aria-labelledby="ms-modal-title">
        <!-- 頂部標題列 -->
        <div class="as-modal-header">
          <div class="as-header-left">
            <span class="as-header-icon">✂️</span>
            <div>
              <div id="ms-modal-title" class="as-header-title">MIDI 小節切片指派至伴奏段落 (Slice to Section)</div>
              <div class="as-header-sub">將選定小節裁切提取，過濾主旋律並組裝為 Yamaha 原廠伴奏段落</div>
            </div>
          </div>
          <button type="button" id="btn-close-ms-modal" class="as-btn-close" aria-label="關閉視窗">✕</button>
        </div>

        <!-- 彈窗內容本體 -->
        <div class="as-modal-body" style="gap: 14px; max-height: calc(85vh - 130px); overflow-y: auto;">
          <!-- 區間與目標段落設定列 -->
          <div style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 8px; padding: 12px 14px; display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 0.85rem; font-weight: 700; color: #38bdf8;">🎯 當前選定小節：</span>
              <span id="ms-range-badge" style="font-size: 0.88rem; font-weight: 700; color: #f8fafc; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.35); padding: 3px 10px; border-radius: 6px;">第 1 ~ 4 小節 (共 4 小節)</span>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <label for="ms-select-section" style="font-size: 0.85rem; font-weight: 700; color: #fbbf24;">指派至 Yamaha 段落：</label>
              <select id="ms-select-section" class="as-select-section" style="min-width: 170px;">
                <!-- 動態注入 Yamaha 16 大標準段落 -->
              </select>
            </div>
          </div>

          <!-- 和弦正規化模式控制列 (Yamaha C 基準大調 vs 直通原曲進行) -->
          <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 8px; padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 1.1rem;">🎼</span>
              <div>
                <span style="font-size: 0.82rem; font-weight: 700; color: #c4b5fd;">和弦正規化模式 (Harmonic Normalization)：</span>
                <span id="ms-norm-desc" style="font-size: 0.73rem; color: #94a3b8; display: block;">Main / Fill 伴奏段落：自動將各小節和弦歸一化為 C 基準大調，琴端左手換和弦 100% 精準轉調。</span>
              </div>
            </div>
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none;">
              <input type="checkbox" id="ms-chk-normalize-chords" style="width: 16px; height: 16px; accent-color: #8b5cf6;" checked>
              <span id="ms-norm-label" style="font-size: 0.82rem; font-weight: 700; color: #a78bfa;">啟用 C 基準大調正規化</span>
            </label>
          </div>

          <!-- 伴奏 8 聲部對照卡網格 (樂器為主、原曲 Ch 為輔) -->
          <div>
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
              <span style="font-size: 0.82rem; font-weight: 700; color: #e2e8f0;">🎼 Yamaha 8 大伴奏聲部映射配置 (已智慧挑選最佳樂器)：</span>
              <button type="button" id="btn-ms-audition-accomp" class="midi-locator-btn" style="background: rgba(16, 185, 129, 0.15); border-color: #10b981; color: #6ee7b7; display: inline-flex; align-items: center; justify-content: center; min-width: 190px; gap: 6px; white-space: nowrap; box-sizing: border-box;" title="排他試聽：只聽即將切入伴奏的樂器，確認無主唱聲音">
                <span>🎧 試聽純伴奏 (排除主旋律)</span>
              </button>
            </div>
            <div id="ms-parts-grid" class="part-matrix-grid" style="margin-top: 0;"></div>
          </div>

          <!-- 排除主旋律區域 -->
          <div id="ms-melody-box" class="melody-excluded-box" style="margin-top: 4px;"></div>
        </div>

        <!-- 底部確認按鈕列 -->
        <div class="as-modal-footer">
          <div style="font-size: 0.74rem; color: #94a3b8;">💡 點擊「確定切片生成」後將自動提取這幾小節並裝配至選定段落中</div>
          <div class="as-footer-actions">
            <button type="button" id="btn-cancel-ms-modal" class="as-btn-cancel">取消</button>
            <button type="button" id="btn-confirm-ms-modal" class="as-btn-confirm">確定切片生成段落</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(wrap);
    this.backdropEl = wrap;

    this.selectSectionEl = wrap.querySelector('#ms-select-section') as HTMLSelectElement;
    this.rangeBadgeEl = wrap.querySelector('#ms-range-badge') as HTMLElement;
    this.gridContainerEl = wrap.querySelector('#ms-parts-grid') as HTMLElement;
    this.melodyBoxEl = wrap.querySelector('#ms-melody-box') as HTMLElement;
    this.btnConfirm = wrap.querySelector('#btn-confirm-ms-modal') as HTMLButtonElement;
    this.btnCancel = wrap.querySelector('#btn-cancel-ms-modal') as HTMLButtonElement;
    this.btnCloseHeader = wrap.querySelector('#btn-close-ms-modal') as HTMLButtonElement;
    this.btnAuditionAccomp = wrap.querySelector('#btn-ms-audition-accomp') as HTMLButtonElement;
    this.chkNormalizeChords = wrap.querySelector('#ms-chk-normalize-chords') as HTMLInputElement;
    this.normDescEl = wrap.querySelector('#ms-norm-desc') as HTMLElement;
    this.normLabelEl = wrap.querySelector('#ms-norm-label') as HTMLElement;
  }

  private bindEvents() {
    this.btnCancel.addEventListener('click', () => this.close());
    this.btnCloseHeader.addEventListener('click', () => this.close());
    this.backdropEl.addEventListener('click', (e) => {
      if (e.target === this.backdropEl) this.close();
    });

    this.btnAuditionAccomp.addEventListener('click', () => {
      this.toggleAccompAudition();
    });

    this.selectSectionEl.addEventListener('change', () => {
      this.updateNormalizeModeBySection();
    });

    this.chkNormalizeChords.addEventListener('change', () => {
      if (this.chkNormalizeChords.checked) {
        this.normLabelEl.style.color = '#a78bfa';
      } else {
        this.normLabelEl.style.color = '#94a3b8';
      }
    });

    this.btnConfirm.addEventListener('click', () => {
      if (!this.currentPlan) return;
      const totalBars = Math.max(1, (this.currentEndBar - this.currentStartBar) + 1);
      const config: MidiSliceAssignConfig = {
        startBar: this.currentStartBar,
        endBar: this.currentEndBar,
        totalBars,
        targetSection: this.selectSectionEl.value || 'Main A',
        mappingPlan: this.currentPlan,
        normalizeChordsToC: this.chkNormalizeChords.checked,
      };

      if (this.onConfirmCallback) {
        this.onConfirmCallback(config);
      }
      this.close();
    });
  }

  private updateNormalizeModeBySection() {
    const sec = this.selectSectionEl.value || 'Main A';
    const isMainOrFill = /^(main|fill|break)/i.test(sec.trim());
    this.chkNormalizeChords.checked = isMainOrFill;
    if (isMainOrFill) {
      this.normDescEl.textContent = 'Main / Fill 伴奏段落：自動將各小節和弦歸一化為 C 基準大調，琴端左手換和弦 100% 精準轉調。';
      this.normLabelEl.style.color = '#a78bfa';
    } else {
      this.normDescEl.textContent = 'Intro / Ending 獨立樂段：維持直通原曲和弦進行，樂手在琴端按單音 C 即可完整播放原曲旋律。';
      this.normLabelEl.style.color = '#94a3b8';
    }
  }

  /**
   * 開啟切片彈窗
   */
  public open(
    analysis: MidiSongAnalysis,
    startBar: number,
    endBar: number,
    plan: SongPartMappingPlan | null,
    onConfirm: (config: MidiSliceAssignConfig) => void,
    onAudition?: (isSoloAccomp: boolean, excludedChannels: number[]) => void,
    sourceParsed?: YamahaFileParsed
  ) {
    this.currentAnalysis = analysis;
    this.currentStartBar = startBar;
    this.currentEndBar = endBar;
    this.currentSourceParsed = sourceParsed;
    this.currentPlan = plan ? plan : MidiPartAssignMatrix.createAutoMappingPlan(
      analysis,
      sourceParsed ? { sourceParsed, startBar, endBar } : undefined
    );
    this.onConfirmCallback = onConfirm;
    this.onAuditionCallback = onAudition || null;
    this.isAuditioningAccomp = false;
    this.updateAuditionButtonUI();

    const span = Math.max(1, (endBar - startBar) + 1);
    this.rangeBadgeEl.textContent = `第 ${startBar} ~ ${endBar} 小節 (共 ${span} 小節)`;

    this.populateSectionOptions();
    this.updateNormalizeModeBySection();
    this.renderPartsGrid();
    this.renderMelodyBox();

    this.backdropEl.style.display = 'flex';
  }

  public close() {
    this.backdropEl.style.display = 'none';
    if (this.isAuditioningAccomp) {
      this.isAuditioningAccomp = false;
      this.updateAuditionButtonUI();
      if (this.onAuditionCallback) {
        this.onAuditionCallback(false, []);
      }
    }
  }

  /**
   * 當底層播放引擎自動播畢停止或外部停止時，重置試聽按鈕至初始狀態
   */
  public resetAuditionState() {
    if (this.isAuditioningAccomp) {
      this.isAuditioningAccomp = false;
      this.updateAuditionButtonUI();
    }
  }

  public getIsAuditioningAccomp(): boolean {
    return this.isAuditioningAccomp;
  }

  public setOnConfirm(cb: (config: MidiSliceAssignConfig) => void) {
    this.onConfirmCallback = cb;
  }

  public setOnAudition(cb: (isSoloAccomp: boolean, excludedChannels: number[]) => void) {
    this.onAuditionCallback = cb;
  }

  private populateSectionOptions() {
    this.selectSectionEl.innerHTML = '';
    const grouped: Record<string, typeof ALL_STANDARD_SECTIONS> = {
      'Main (主歌/副歌)': ALL_STANDARD_SECTIONS.filter(s => s.category === 'Main'),
      'Intro (前奏)': ALL_STANDARD_SECTIONS.filter(s => s.category === 'Intro'),
      'Fill In (加花/過門)': ALL_STANDARD_SECTIONS.filter(s => s.category === 'Fill In'),
      'Ending (尾奏)': ALL_STANDARD_SECTIONS.filter(s => s.category === 'Ending'),
    };

    for (const [groupName, list] of Object.entries(grouped)) {
      const optGroup = document.createElement('optgroup');
      optGroup.label = groupName;
      for (const item of list) {
        const opt = document.createElement('option');
        opt.value = item.name;
        opt.textContent = `${item.label} (${item.name})`;
        if (item.name === 'Main A') opt.selected = true;
        optGroup.appendChild(opt);
      }
      this.selectSectionEl.appendChild(optGroup);
    }
  }

  private renderPartsGrid() {
    if (!this.currentPlan || !this.currentAnalysis) return;
    const plan = this.currentPlan;
    const availableChannels = this.currentAnalysis.activeChannels.filter(c => c.hasNotes && c.noteCount > 0);

    this.gridContainerEl.innerHTML = YAMAHA_ARRANGER_PARTS.map((pDef) => {
      const currentSrcCh = plan.partToSourceChannelMap.get(pDef.part);
      const matchedAssignment = currentSrcCh !== undefined
        ? plan.assignments.find(a => a.sourceChannel === currentSrcCh)
        : null;

      const voiceDisplay = matchedAssignment ? matchedAssignment.voiceName : '未指派 (此伴奏聲部靜音)';
      const trackDisplay = matchedAssignment && matchedAssignment.trackNames.length > 0
        ? matchedAssignment.trackNames.join(' / ')
        : (matchedAssignment ? '原曲音軌' : '無');
      const catIcon = pDef.part.includes('Rhythm') ? '🥁' : (pDef.part === 'Bass' ? '🎸' : (pDef.part.includes('Chord') ? '🎹' : (pDef.part === 'Pad' ? '🎻' : '🎷')));

      const optionsHtml = [
        `<option value="-1" ${currentSrcCh === undefined ? 'selected' : ''}>-- 靜音此聲部 (未指派) --</option>`,
        ...availableChannels.map((ch) => {
          const isSelected = currentSrcCh === ch.channel;
          const trkLabel = ch.trackNames[0] ? ` · ${ch.trackNames[0]}` : '';
          return `<option value="${ch.channel}" ${isSelected ? 'selected' : ''}>${ch.voiceName} (${ch.displayChannel}軌${trkLabel}) [${ch.noteCount}音符]</option>`;
        })
      ].join('');

      return `
        <div class="part-assign-card" style="--part-accent: ${this.getPartColor(pDef.channel)};">
          <div class="part-assign-top">
            <span class="part-target-label">${catIcon} ${pDef.nameZh}</span>
            <span class="part-role-desc">${pDef.defaultRole}</span>
          </div>

          <div class="part-source-box">
            <div class="part-source-voice" title="${voiceDisplay}">
              <span>${voiceDisplay}</span>
            </div>
            <div class="part-source-meta">
              <span>來源軌道: <strong style="color: #cbd5e1;">${trackDisplay}</strong></span>
              <span style="color: #64748b;">${matchedAssignment ? `(原曲 CH ${matchedAssignment.displaySourceChannel} · ${matchedAssignment.noteCount}音符)` : ''}</span>
            </div>
          </div>

          <select class="part-source-select" data-target-part="${pDef.part}" title="變更此伴奏聲部的樂器來源">
            ${optionsHtml}
          </select>
        </div>
      `;
    }).join('');

    // 綁定各聲部選擇變更事件
    this.gridContainerEl.querySelectorAll('.part-source-select').forEach((sel) => {
      sel.addEventListener('change', (e) => {
        const selectEl = e.target as HTMLSelectElement;
        const targetPart = selectEl.getAttribute('data-target-part') as YamahaPartType;
        const newSrcCh = parseInt(selectEl.value, 10);

        if (newSrcCh === -1) {
          plan.partToSourceChannelMap.delete(targetPart);
          const old = plan.assignments.find(a => a.targetPart === targetPart);
          if (old) {
            old.targetPart = null;
            old.targetChannel = null;
          }
        } else {
          for (const [p, ch] of plan.partToSourceChannelMap.entries()) {
            if (ch === newSrcCh) {
              plan.partToSourceChannelMap.delete(p);
            }
          }
          const assign = plan.assignments.find(a => a.sourceChannel === newSrcCh);
          if (assign) {
            assign.isExcluded = false;
            MidiPartAssignMatrix['bindPart'](assign, targetPart, plan.partToSourceChannelMap);
          }
        }
        plan.assignedCount = plan.partToSourceChannelMap.size;
        this.renderPartsGrid();
        this.renderMelodyBox();
      });
    });
  }

  private renderMelodyBox() {
    if (!this.currentPlan) return;
    const plan = this.currentPlan;
    const excludedList = plan.assignments.filter(a => a.isExcluded);

    const excludedRowsHtml = excludedList.length > 0
      ? excludedList.map((a) => {
          return `
            <div class="melody-item-row">
              <div style="display: flex; align-items: center; gap: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                <span style="font-weight: 700; color: #fca5a5;">${a.voiceName}</span>
                <span style="color: #94a3b8;">· 軌道: ${a.trackNames.join(' / ') || '無'}</span>
                <span style="color: #64748b;">(原曲 CH ${a.displaySourceChannel} · ${a.noteCount} 音符)</span>
              </div>
              <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
                <span style="font-size: 0.7rem; color: #f87171; background: rgba(239, 68, 68, 0.15); padding: 1px 6px; border-radius: 4px;">
                  ${a.melodyInfo.reasons[0] || '偵測為主旋律'} (${a.melodyInfo.confidence}%)
                </span>
                <label style="display: flex; align-items: center; gap: 4px; font-size: 0.72rem; cursor: pointer; color: #38bdf8;">
                  <input type="checkbox" class="chk-modal-include-melody" data-channel="${a.sourceChannel}" title="打勾取消排除，強制納入伴奏聲部供指派">
                  <span>納入伴奏</span>
                </label>
              </div>
            </div>
          `;
        }).join('')
      : `<div style="font-size: 0.74rem; color: #94a3b8; padding: 4px 0;">全曲各軌皆判定為常規伴奏樂器，無自動排除項目。</div>`;

    this.melodyBoxEl.innerHTML = `
      <div class="melody-excluded-title">
        <span>🎤 智慧偵測主旋律（已預設排除於伴奏之外，避免伴奏複唱主唱旋律）</span>
      </div>
      ${excludedRowsHtml}
    `;

    this.melodyBoxEl.querySelectorAll('.chk-modal-include-melody').forEach((chk) => {
      chk.addEventListener('change', (e) => {
        const inputEl = e.target as HTMLInputElement;
        const ch = parseInt(inputEl.getAttribute('data-channel') || '-1', 10);
        const assign = plan.assignments.find(a => a.sourceChannel === ch);
        if (assign) {
          assign.isExcluded = !inputEl.checked;
          plan.excludedCount = plan.assignments.filter(a => a.isExcluded).length;
          this.renderPartsGrid();
          this.renderMelodyBox();
        }
      });
    });
  }

  private toggleAccompAudition() {
    this.isAuditioningAccomp = !this.isAuditioningAccomp;
    this.updateAuditionButtonUI();
    if (this.onAuditionCallback && this.currentPlan) {
      const excludedChs = this.currentPlan.assignments
        .filter(a => a.isExcluded || a.targetPart === null)
        .map(a => a.sourceChannel);
      this.onAuditionCallback(this.isAuditioningAccomp, excludedChs);
    }
  }

  private updateAuditionButtonUI() {
    if (this.isAuditioningAccomp) {
      this.btnAuditionAccomp.innerHTML = `<span>⏹ 停止試聽純伴奏</span>`;
      this.btnAuditionAccomp.style.background = 'rgba(239, 68, 68, 0.2)';
      this.btnAuditionAccomp.style.borderColor = '#ef4444';
      this.btnAuditionAccomp.style.color = '#fca5a5';
    } else {
      this.btnAuditionAccomp.innerHTML = `<span>🎧 試聽純伴奏 (排除主旋律)</span>`;
      this.btnAuditionAccomp.style.background = 'rgba(16, 185, 129, 0.15)';
      this.btnAuditionAccomp.style.borderColor = '#10b981';
      this.btnAuditionAccomp.style.color = '#6ee7b7';
    }
  }

  private getPartColor(channel: number): string {
    const palette = [
      '#f59e0b', '#ef4444', '#3b82f6', '#10b981',
      '#06b6d4', '#a855f7', '#ec4899', '#eab308'
    ];
    return palette[(channel - 8) % palette.length] || '#38bdf8';
  }
}
