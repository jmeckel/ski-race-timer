/**
 * Export utilities
 * CSV export in Race Horology format
 */

import { store } from '../store';
import { t } from '../i18n/translations';
import { showToast } from '../components';
import { feedbackSuccess } from '../services';
import type { Entry, Language } from '../types';

/**
 * Format timestamp for Race Horology CSV export
 * Converts ISO timestamp to HH:MM:SS,ss format (hundredths of seconds)
 */
export function formatTimeForRaceHorology(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  // Convert milliseconds to hundredths and round
  const hundredths = Math.round(date.getMilliseconds() / 10).toString().padStart(2, '0');

  return `${hours}:${minutes}:${seconds},${hundredths}`;
}

/**
 * Escape CSV field to prevent formula injection and handle special characters
 * Prefixes formula characters with single quote
 */
export function escapeCSVField(field: string): string {
  // Check for formula injection characters
  const formulaChars = ['=', '+', '-', '@', '\t', '\r', '\n'];
  let escaped = field;

  // Prefix with single quote if starts with formula character
  if (formulaChars.some(char => escaped.startsWith(char))) {
    escaped = `'${escaped}`;
  }

  // Escape quotes by doubling them
  if (escaped.includes('"')) {
    escaped = escaped.replace(/"/g, '""');
  }

  // Wrap in quotes if contains special characters
  if (escaped.includes(';') || escaped.includes('"') || escaped.includes('\n')) {
    escaped = `"${escaped}"`;
  }

  return escaped;
}

/**
 * Get timing point label for export
 * Returns "ST" for Start, "FT" for Finish (Race Horology format)
 */
function getExportPointLabel(point: 'S' | 'F'): string {
  return point === 'S' ? 'ST' : 'FT';
}

/**
 * Get status label for export in specified language
 */
function getStatusLabel(status: string, lang: Language): string {
  const statusMap: Record<string, Record<Language, string>> = {
    ok: { en: 'OK', de: 'OK' },
    dns: { en: 'DNS', de: 'DNS' },
    dnf: { en: 'DNF', de: 'DNF' },
    dsq: { en: 'DSQ', de: 'DSQ' },
  };
  return statusMap[status]?.[lang] || status.toUpperCase();
}

/**
 * Export results as CSV file in Race Horology format
 */
export function exportResults(): void {
  const state = store.getState();
  const entries = state.entries;
  const lang = state.currentLang;

  if (entries.length === 0) {
    showToast(t('noEntries', lang), 'warning');
    return;
  }

  // Sort entries by timestamp
  const sortedEntries = [...entries].sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Build CSV content
  // Header: Startnummer;Lauf;Messpunkt;Zeit;Status;Gerät
  const header = 'Startnummer;Lauf;Messpunkt;Zeit;Status;Gerät';

  const rows = sortedEntries.map(entry => {
    const bib = escapeCSVField(entry.bib);
    const run = entry.run ?? 1;
    const point = getExportPointLabel(entry.point);
    const time = formatTimeForRaceHorology(entry.timestamp);
    const status = getStatusLabel(entry.status, lang);
    const device = escapeCSVField(entry.deviceName || entry.deviceId);

    return `${bib};${run};${point};${time};${status};${device}`;
  });

  const csvContent = [header, ...rows].join('\n');

  // Create and download file
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;

  // Filename format: race-id_YYYY-MM-DD.csv
  const date = new Date().toISOString().split('T')[0];
  const raceId = state.raceId || 'race';
  link.download = `${raceId}_${date}.csv`;

  // Trigger download
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Cleanup
  URL.revokeObjectURL(url);

  // Feedback
  feedbackSuccess();
  showToast(t('exported', lang), 'success');
}

/**
 * Generate export filename
 */
export function getExportFilename(raceId: string, extension: string = 'csv'): string {
  const date = new Date().toISOString().split('T')[0];
  const safeRaceId = raceId.replace(/[^a-zA-Z0-9-_]/g, '_') || 'race';
  return `${safeRaceId}_${date}.${extension}`;
}
