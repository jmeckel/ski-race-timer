/**
 * Shared HTML template helpers
 * Reduces duplication of SVG icons and common UI patterns across the codebase.
 */

import { t } from '../i18n/translations';
import type { Language } from '../types';
import { escapeAttr, escapeHtml, getFaultTypeLabel } from './format';

// ---------------------------------------------------------------------------
// SVG Icon Templates
// ---------------------------------------------------------------------------

/**
 * Trash / delete icon (three-part path: lid, can body, handle)
 * Used in: VirtualList, chiefJudgeView, faultInlineEntry, gateJudge, SwipeActions
 */
export function iconTrash(size = 18): string {
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`;
}

/**
 * Trash icon with individual lines for lid detail (used in chief judge delete buttons)
 * Includes vertical lines inside the trash can
 */
export function iconTrashDetailed(size = 14): string {
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="9" y1="11" x2="9" y2="17"/><line x1="15" y1="11" x2="15" y2="17"/></svg>`;
}

/**
 * Edit / pencil icon
 * Used in: VirtualList, chiefJudgeView, SwipeActions
 */
export function iconEdit(size = 18): string {
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
}

/**
 * Checkmark icon
 * Used in: chiefJudgeView (finalize buttons, approve buttons)
 */
export function iconCheck(size = 16, strokeWidth = 2.5): string {
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}"><path d="M20 6L9 17l-5-5"/></svg>`;
}

/**
 * X / close icon
 * Used in: chiefJudgeView (reject buttons)
 */
export function iconX(size = 16, strokeWidth = 2): string {
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
}

/**
 * Chevron-right icon (used for expandable group headers)
 */
export function iconChevron(size = 16, rotated = false): string {
  const rotateStyle = rotated ? 'transform: rotate(90deg);' : '';
  return `<svg class="group-chevron" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true" style="flex-shrink: 0; transition: transform 0.2s; ${rotateStyle}"><path d="M9 18l6-6-6-6"/></svg>`;
}

/**
 * Duplicate / copy icon (used for cross-device duplicate badges)
 */
export function iconDuplicate(size = 12): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`;
}

/**
 * Camera icon (used for photo buttons)
 */
export function iconCamera(size = 18): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor"><path d="M12 15.2a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4z"/><path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/></svg>`;
}

/**
 * Warning circle icon (used for deletion pending badges)
 */
export function iconWarningCircle(size = 12): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 9v4M12 17h.01"/><circle cx="12" cy="12" r="10"/></svg>`;
}

/**
 * Timer / stopwatch icon (used for timer role cards)
 */
export function iconTimer(size = 18): string {
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M12 5V3"/><path d="M10 3h4"/></svg>`;
}

/**
 * Flag icon (used for gate judge role cards)
 */
export function iconFlag(size = 18): string {
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`;
}

/**
 * Note / document icon (used for fault notes)
 */
export function iconNote(size = 14): string {
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`;
}

/**
 * Hourglass icon (used for loading states)
 */
export function iconHourglass(size = 16): string {
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2v6l4 4-4 4v6h12v-6l-4-4 4-4V2H6z"/></svg>`;
}

// ---------------------------------------------------------------------------
// Composite UI Patterns
// ---------------------------------------------------------------------------

/**
 * Edit action button (icon-only, used in list items)
 */
export function editButton(opts: {
  ariaLabel: string;
  size?: number;
  className?: string;
}): string {
  const cls = opts.className || 'result-edit-btn';
  return `<button class="${cls}" aria-label="${escapeAttr(opts.ariaLabel)}" style="background: none; border: none; color: var(--primary); padding: 6px; cursor: pointer; opacity: 0.7;">${iconEdit(opts.size || 18)}</button>`;
}

/**
 * Delete action button (icon-only, used in list items)
 */
export function deleteButton(opts: {
  ariaLabel: string;
  size?: number;
  className?: string;
}): string {
  const cls = opts.className || 'result-delete';
  return `<button class="${cls}" aria-label="${escapeAttr(opts.ariaLabel)}" style="background: none; border: none; color: var(--error); padding: 6px; cursor: pointer; opacity: 0.7;">${iconTrash(opts.size || 18)}</button>`;
}

/**
 * Photo view button (icon-only, used in result items)
 */
export function photoButton(ariaLabel: string): string {
  return `<button class="result-photo-btn" aria-label="${escapeAttr(ariaLabel)}" style="background: none; border: none; color: var(--primary); padding: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center;">${iconCamera()}</button>`;
}

/**
 * Cross-device duplicate badge
 */
export function duplicateBadge(lang: Language): string {
  return `<span class="result-duplicate-badge" title="${escapeAttr(t('multiDeviceDuplicate', lang))}" aria-label="${escapeAttr(t('multiDeviceDuplicate', lang))}">${iconDuplicate()} ${escapeHtml(t('multiDeviceDuplicate', lang))}</span>`;
}

/**
 * Fault count badge for result items
 */
export function faultBadge(opts: {
  faults: Array<{ gateNumber: number; faultType: string }>;
  lang: Language;
}): string {
  const { faults, lang } = opts;
  if (faults.length === 0) return '';

  const detailTitle = faults
    .map(
      (f) =>
        `T${f.gateNumber} (${getFaultTypeLabel(f.faultType as 'MG' | 'STR' | 'BR', lang)})`,
    )
    .join(', ');

  const label =
    faults.length > 1
      ? `${faults.length}\u00D7 ${t('flt', lang)}`
      : `T${faults[0]?.gateNumber || '?'}`;

  return `<span class="result-fault-badge" title="${escapeAttr(detailTitle)}" style="padding: 2px 6px; border-radius: var(--radius); font-size: 0.7rem; font-weight: 600; background: var(--warning); color: #000;">${escapeHtml(label)}</span>`;
}

/**
 * Map status codes to chip colors (outlined/tinted style)
 */
const statusChipColors: Record<string, string> = {
  dns: '#8899aa', // prototype muted gray-blue
  dnf: '#ffd700', // prototype warning gold
  dsq: '#ff4757', // prototype error red
  flt: '#ffd700', // fault penalty uses warning gold
};

/**
 * Status badge (DNS, DNF, DSQ, FLT) — outlined chip style
 */
export function statusBadge(
  status: string,
  colorOverride = '',
  fontSize = '0.65rem',
): string {
  const color =
    statusChipColors[status.toLowerCase()] || colorOverride || '#ef4444';
  return `<span class="result-status" style="--item-color: ${color}; font-size: ${fontSize};">${escapeHtml(status)}</span>`;
}

/**
 * Deletion-pending badge ("DEL" with warning icon)
 */
export function deletionPendingBadge(fontSize = '0.7rem'): string {
  return `<span class="deletion-pending-status" style="display: flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: var(--radius); font-size: ${fontSize}; font-weight: 600; background: var(--error); color: white;">${iconWarningCircle()} DEL</span>`;
}

/**
 * Run label badge (L1/L2 or R1/R2) — outlined chip style (matches statusBadge)
 */
export function runBadge(runLabel: string, runColor: string): string {
  return `<span class="result-run" data-advanced style="--item-color: ${runColor};">${escapeHtml(runLabel)}</span>`;
}

/**
 * Point label badge (Start/Finish/Gate) — outlined chip style (matches statusBadge)
 */
export function pointBadge(
  pointLabel: string,
  pointColor: string,
): string {
  return `<div class="result-point" style="--item-color: ${pointColor};">${escapeHtml(pointLabel)}</div>`;
}