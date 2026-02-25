import { t } from '../i18n/translations';
import type { FaultType, Language, Run, TimingPoint } from '../types';

const LOCALE_MAP: Record<Language, string> = {
  en: 'en-US',
  de: 'de-DE',
  fr: 'fr-FR',
};

export function getLocale(lang: Language): string {
  return LOCALE_MAP[lang];
}

/**
 * Format time as HH:MM:SS.mmm
 */
export function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}

/**
 * Format date in locale-aware format
 */
export function formatDate(date: Date, lang: Language = 'de'): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  };
  return date.toLocaleDateString(getLocale(lang), options);
}

/**
 * Format duration in MM:SS.cc (centiseconds)
 */
export function formatDuration(ms: number): string {
  if (ms < 0) return '--:--.--';

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = Math.floor((ms % 1000) / 10);

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

/**
 * Format bib number with leading zeros
 */
export function formatBib(bib: string | number, digits: number = 3): string {
  return String(bib).padStart(digits, '0');
}

/**
 * Escape HTML to prevent XSS
 */
export function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

/**
 * Escape string for use in HTML attributes
 * Escapes quotes in addition to HTML entities
 */
export function escapeAttr(str: string): string {
  return escapeHtml(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Get color for timing point
 */
export function getPointColor(point: TimingPoint): string {
  const colors: Record<TimingPoint, string> = {
    S: 'var(--start-color)',
    F: 'var(--finish-color)',
  };
  return colors[point] || 'var(--text-secondary)';
}

/**
 * Get display label for timing point
 */
export function getPointLabel(
  point: TimingPoint,
  lang: Language = 'de',
): string {
  const labels: Record<Language, Record<TimingPoint, string>> = {
    en: { S: 'Start', F: 'Finish' },
    de: { S: 'Start', F: 'Ziel' },
    fr: { S: 'Départ', F: 'Arrivée' },
  };
  return labels[lang][point];
}

/**
 * Get display label for run
 */
const RUN_PREFIX: Record<Language, string> = { de: 'L', en: 'R', fr: 'M' };

export function getRunLabel(run: Run, lang: Language = 'de'): string {
  const prefix = RUN_PREFIX[lang];
  return `${prefix}${run}`;
}

/**
 * Get color for run
 */
export function getRunColor(run: Run): string {
  if (run === 1) return 'var(--primary)';
  if (run === 2) return 'var(--warning)';
  return 'var(--text-secondary)';
}

/**
 * Get localized fault type label
 */
export function getFaultTypeLabel(
  faultType: FaultType,
  lang: Language,
): string {
  const labels: Record<FaultType, string> = {
    MG: t('faultMGShort', lang),
    STR: t('faultSTRShort', lang),
    BR: t('faultBRShort', lang),
  };
  return labels[faultType] || faultType;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength - 3)}...`;
}

/**
 * Debounce function. Returns a debounced wrapper with a `.cancel()` method
 * for cleanup in component destroy paths.
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number,
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout>;
  const debounced = (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
  debounced.cancel = () => clearTimeout(timeoutId);
  return debounced;
}

/**
 * Throttle function
 */
export function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  limit: number,
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}
