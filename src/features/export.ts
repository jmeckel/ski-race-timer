/**
 * Export utilities
 * CSV export in Race Horology format
 */

import { store } from '../store';
import { t } from '../i18n/translations';
import { showToast } from '../components';
import { feedbackSuccess } from '../services';
import type { Entry, Language, FaultEntry, FaultType } from '../types';

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
    flt: { en: 'FLT', de: 'STR' },  // Fault penalty (Strafzeit)
  };
  return statusMap[status]?.[lang] || status.toUpperCase();
}

/**
 * Get fault type code for export (German format)
 */
function getFaultTypeCode(faultType: FaultType, lang: Language): string {
  const codes: Record<FaultType, Record<Language, string>> = {
    'MG': { en: 'MG', de: 'MG' },   // Missed Gate / Tor verfehlt
    'STR': { en: 'STR', de: 'EF' }, // Straddling / Einfädler
    'BR': { en: 'BR', de: 'AB' },   // Binding Release / Ausfall Bindung
  };
  return codes[faultType]?.[lang] || faultType;
}

/**
 * Format faults for CSV export
 * Returns string like "T4(MG),T8(EF)"
 */
function formatFaultsForCSV(faults: FaultEntry[], lang: Language): string {
  if (faults.length === 0) return '';
  return faults
    .sort((a, b) => a.gateNumber - b.gateNumber)
    .map(f => `T${f.gateNumber}(${getFaultTypeCode(f.faultType, lang)})`)
    .join(',');
}

/**
 * Export results as CSV file in Race Horology format
 * Now includes fault columns: Torstrafzeit, Torfehler
 */
export function exportResults(): void {
  const state = store.getState();
  const entries = state.entries;
  const faults = state.faultEntries;
  const lang = state.currentLang;

  if (entries.length === 0) {
    showToast(t('noEntries', lang), 'warning');
    return;
  }

  // Sort entries by timestamp
  const sortedEntries = [...entries].sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Check if there are any faults - if so, include fault columns
  const hasFaults = faults.length > 0;

  // Build CSV content
  // Extended header with fault columns when faults exist
  const header = hasFaults
    ? 'Startnummer;Lauf;Messpunkt;Zeit;Status;Gerät;Torstrafzeit;Torfehler'
    : 'Startnummer;Lauf;Messpunkt;Zeit;Status;Gerät';

  const rows = sortedEntries.map(entry => {
    const bib = escapeCSVField(entry.bib);
    const run = entry.run ?? 1;
    const point = getExportPointLabel(entry.point);
    const time = formatTimeForRaceHorology(entry.timestamp);
    const device = escapeCSVField(entry.deviceName || entry.deviceId);

    // Get faults for this bib/run (only on Finish entries)
    const entryFaults = entry.point === 'F'
      ? faults.filter(f => f.bib === entry.bib && f.run === run)
      : [];

    // Determine status based on faults
    let status: string;
    if (entry.point === 'F' && entryFaults.length > 0) {
      // If using penalty mode, status is FLT; otherwise DSQ
      status = state.usePenaltyMode ? getStatusLabel('flt', lang) : getStatusLabel('dsq', lang);
    } else {
      status = getStatusLabel(entry.status, lang);
    }

    if (hasFaults) {
      // Calculate penalty time
      const penaltySeconds = entryFaults.length > 0 && state.usePenaltyMode
        ? entryFaults.length * state.penaltySeconds
        : 0;
      const faultStr = formatFaultsForCSV(entryFaults, lang);

      return `${bib};${run};${point};${time};${status};${device};${penaltySeconds};${faultStr}`;
    } else {
      return `${bib};${run};${point};${time};${status};${device}`;
    }
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

/**
 * Export gate judge report (Torrichterkarte) as text file
 * Shows faults recorded by the current device
 */
export function exportJudgeReport(): void {
  const state = store.getState();
  const lang = state.currentLang;
  const faults = state.faultEntries;
  const deviceName = state.deviceName;
  const deviceId = state.deviceId;
  const raceId = state.raceId || 'RACE';
  const gateAssignment = state.gateAssignment;

  // Filter faults to only those recorded by this device
  const myFaults = faults.filter(f => f.deviceId === deviceId);

  // Build report
  const lines: string[] = [];
  const divider = '═'.repeat(45);
  const thinDivider = '─'.repeat(45);

  lines.push(divider);
  lines.push(`        ${t('gateJudgeCard', lang).toUpperCase()}`);
  lines.push(divider);
  lines.push(`${t('race', lang)}:     ${raceId}`);
  lines.push(`${t('date', lang)}:      ${new Date().toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-US')}`);
  lines.push(`${t('gateJudgeLabel', lang)}: ${deviceName}`);
  if (gateAssignment) {
    lines.push(`${t('gates', lang)}:       ${gateAssignment[0]} - ${gateAssignment[1]}`);
  }
  lines.push(thinDivider);

  // Group faults by run
  const run1Faults = myFaults.filter(f => f.run === 1);
  const run2Faults = myFaults.filter(f => f.run === 2);

  const formatFaultRow = (f: FaultEntry): string => {
    const bib = f.bib.padStart(5);
    const gate = String(f.gateNumber).padStart(4);
    const type = getFaultTypeCode(f.faultType, lang).padEnd(10);
    const time = new Date(f.timestamp).toLocaleTimeString(lang === 'de' ? 'de-DE' : 'en-US');
    return `  ${bib}   │  ${gate}  │ ${type} │ ${time}`;
  };

  const bibHeader = t('bib', lang);
  const gateHeader = t('gate', lang);
  const faultHeader = t('faultType', lang);
  const timeHeader = t('time', lang);

  if (run1Faults.length > 0 || run2Faults.length === 0) {
    lines.push(`${t('runLabel', lang)} 1:`);
    lines.push(`${bibHeader.substring(0, 7).padEnd(7)} │ ${gateHeader.substring(0, 4).padEnd(4)} │ ${faultHeader.substring(0, 9).padEnd(9)} │ ${timeHeader}`);
    lines.push('────────┼──────┼───────────┼───────────────');
    if (run1Faults.length === 0) {
      lines.push(`  ${t('noFaultsEntered', lang)}`);
    } else {
      run1Faults.forEach(f => lines.push(formatFaultRow(f)));
    }
    lines.push('');
  }

  if (run2Faults.length > 0) {
    lines.push(`${t('runLabel', lang)} 2:`);
    lines.push(`${bibHeader.substring(0, 7).padEnd(7)} │ ${gateHeader.substring(0, 4).padEnd(4)} │ ${faultHeader.substring(0, 9).padEnd(9)} │ ${timeHeader}`);
    lines.push('────────┼──────┼───────────┼───────────────');
    run2Faults.forEach(f => lines.push(formatFaultRow(f)));
    lines.push('');
  }

  lines.push(thinDivider);
  lines.push(`${t('signature', lang)}: ________________________`);
  lines.push('');
  lines.push(`${t('legend', lang)}: MG=${t('missedGateLegend', lang)}, ${getFaultTypeCode('STR', lang)}=${t('straddlingLegend', lang)}, ${getFaultTypeCode('BR', lang)}=${t('bindingLegend', lang)}`);
  lines.push(divider);

  const content = lines.join('\n');

  // Create and download file
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = getExportFilename(`${raceId}_${t('gateJudgeCard', lang)}_${deviceName.replace(/\s+/g, '_')}`, 'txt');

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);

  feedbackSuccess();
  showToast(t('exported', lang), 'success');
}

/**
 * Export fault summary as WhatsApp-friendly text
 * Uses emojis and clear formatting for mobile sharing
 */
export function exportFaultSummaryWhatsApp(): void {
  const state = store.getState();
  const lang = state.currentLang;
  const faults = state.faultEntries;
  const raceId = state.raceId || 'RACE';

  if (faults.length === 0) {
    showToast(t('noFaultsToExport', lang), 'warning');
    return;
  }

  // Group faults by bib and run
  const faultsByBib = new Map<string, FaultEntry[]>();
  for (const fault of faults) {
    const key = `${fault.bib}-${fault.run}`;
    if (!faultsByBib.has(key)) {
      faultsByBib.set(key, []);
    }
    faultsByBib.get(key)!.push(fault);
  }

  // Build WhatsApp message
  const lines: string[] = [];

  // Header
  lines.push(`📋 ${t('gateFaults', lang)} - ${raceId}`);
  lines.push('');

  // Group by run
  const run1Bibs = Array.from(faultsByBib.entries()).filter(([key]) => key.endsWith('-1'));
  const run2Bibs = Array.from(faultsByBib.entries()).filter(([key]) => key.endsWith('-2'));

  const formatBibFaults = (key: string, racerFaults: FaultEntry[]): string => {
    const [bib] = key.split('-');
    const paddedBib = bib.padStart(3, '0');
    const gateList = racerFaults
      .sort((a, b) => a.gateNumber - b.gateNumber)
      .map(f => `T${f.gateNumber}`)
      .join('+');
    const faultTypes = racerFaults
      .map(f => getFaultTypeCode(f.faultType, lang))
      .join(', ');

    if (state.usePenaltyMode) {
      const penalty = racerFaults.length * state.penaltySeconds;
      return `#${paddedBib}: ${gateList} (${faultTypes}) → +${penalty}s`;
    } else {
      return `#${paddedBib}: ${gateList} (${faultTypes})`;
    }
  };

  // Run 1
  if (run1Bibs.length > 0) {
    lines.push(`🏁 ${t('runLabel', lang)} 1:`);
    if (state.usePenaltyMode) {
      lines.push(`🟡 ${t('penaltyLabel', lang)}:`);
    } else {
      lines.push(`🔴 DSQ:`);
    }
    run1Bibs
      .sort((a, b) => parseInt(a[0].split('-')[0]) - parseInt(b[0].split('-')[0]))
      .forEach(([key, racerFaults]) => {
        lines.push(formatBibFaults(key, racerFaults));
      });
    lines.push('');
  }

  // Run 2
  if (run2Bibs.length > 0) {
    lines.push(`🏁 ${t('runLabel', lang)} 2:`);
    if (state.usePenaltyMode) {
      lines.push(`🟡 ${t('penaltyLabel', lang)}:`);
    } else {
      lines.push(`🔴 DSQ:`);
    }
    run2Bibs
      .sort((a, b) => parseInt(a[0].split('-')[0]) - parseInt(b[0].split('-')[0]))
      .forEach(([key, racerFaults]) => {
        lines.push(formatBibFaults(key, racerFaults));
      });
    lines.push('');
  }

  // Footer
  const now = new Date();
  lines.push(`📅 ${now.toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-US')} ${now.toLocaleTimeString(lang === 'de' ? 'de-DE' : 'en-US', { hour: '2-digit', minute: '2-digit' })}`);

  const content = lines.join('\n');

  // Copy to clipboard for easy sharing
  if (navigator.clipboard) {
    navigator.clipboard.writeText(content).then(() => {
      feedbackSuccess();
      showToast(t('copiedToClipboard', lang), 'success');
    }).catch(() => {
      // Fallback: download as file
      downloadTextFile(content, getExportFilename(`${raceId}_WhatsApp`, 'txt'));
    });
  } else {
    // Fallback: download as file
    downloadTextFile(content, getExportFilename(`${raceId}_WhatsApp`, 'txt'));
  }
}

/**
 * Export chief judge fault summary as text
 */
export function exportChiefSummary(): void {
  const state = store.getState();
  const lang = state.currentLang;
  const faults = state.faultEntries;
  const raceId = state.raceId || 'RACE';

  if (faults.length === 0) {
    showToast(t('noFaultsToExport', lang), 'warning');
    return;
  }

  // Group faults by bib and run
  const faultsByBib = new Map<string, FaultEntry[]>();
  for (const fault of faults) {
    const key = `${fault.bib}-${fault.run}`;
    if (!faultsByBib.has(key)) {
      faultsByBib.set(key, []);
    }
    faultsByBib.get(key)!.push(fault);
  }

  const lines: string[] = [];
  const divider = '══════════════════════════════════════════════════════';

  // Group by run
  const run1Bibs = Array.from(faultsByBib.entries()).filter(([key]) => key.endsWith('-1'));
  const run2Bibs = Array.from(faultsByBib.entries()).filter(([key]) => key.endsWith('-2'));

  const formatRunSummary = (runBibs: [string, FaultEntry[]][], runNum: number) => {
    if (runBibs.length === 0) return;

    lines.push(`${t('faultSummaryTitle', lang)} - ${t('runLabel', lang)} ${runNum}`);
    lines.push(divider);
    lines.push(`${t('bib', lang).substring(0, 7).padEnd(7)} │ ${t('faults', lang).padEnd(16)} │ ${t('penalty', lang).padStart(9)} │ Status`);
    lines.push('────────┼──────────────────┼───────────┼────────');

    runBibs
      .sort((a, b) => parseInt(a[0].split('-')[0]) - parseInt(b[0].split('-')[0]))
      .forEach(([key, racerFaults]) => {
        const [bib] = key.split('-');
        const paddedBib = bib.padStart(5);
        const faultStr = racerFaults
          .sort((a, b) => a.gateNumber - b.gateNumber)
          .map(f => `T${f.gateNumber}(${getFaultTypeCode(f.faultType, lang)})`)
          .join(', ')
          .padEnd(16);

        let penaltyStr: string;
        let statusStr: string;
        if (state.usePenaltyMode) {
          const penalty = racerFaults.length * state.penaltySeconds;
          penaltyStr = `${penalty} ${t('sec', lang)}`.padStart(9);
          statusStr = t('flt', lang);
        } else {
          penaltyStr = '-'.padStart(9);
          statusStr = 'DSQ';
        }

        lines.push(`  ${paddedBib}   │ ${faultStr} │ ${penaltyStr} │ ${statusStr}`);
      });

    lines.push('');
  };

  lines.push(`${raceId} - ${new Date().toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-US')}`);
  lines.push('');

  formatRunSummary(run1Bibs, 1);
  formatRunSummary(run2Bibs, 2);

  lines.push(divider);
  lines.push(`${t('generated', lang)}: ${new Date().toLocaleString(lang === 'de' ? 'de-DE' : 'en-US')}`);

  const content = lines.join('\n');

  downloadTextFile(content, getExportFilename(`${raceId}_${t('summary', lang)}`, 'txt'));

  feedbackSuccess();
  showToast(t('exported', lang), 'success');
}

/**
 * Helper to download text content as file
 */
function downloadTextFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
