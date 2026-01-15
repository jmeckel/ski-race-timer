import type { Language, Translations } from '../types';

export const translations: Record<Language, Translations> = {
  en: {
    // Navigation
    timer: 'Timer',
    results: 'Results',
    settings: 'Settings',

    // Timer View
    start: 'Start',
    finish: 'Finish',
    bib: 'Bib',
    point: 'Point',
    time: 'Record time',
    lastRecorded: 'Last recorded',

    // Results View
    status: 'Status',
    noEntries: 'No entries recorded',
    search: 'Search by bib...',
    filter: 'Filter',
    all: 'All',
    total: 'Total',
    racers: 'Racers',
    finished: 'Finished',
    fastest: 'Fastest',
    average: 'Average',

    // Status
    ok: 'OK',
    dns: 'DNS',
    dnf: 'DNF',
    dsq: 'DSQ',

    // Actions
    confirmDelete: 'Delete Entry',
    confirmDeleteText: 'Are you sure you want to delete this entry?',
    confirmClearAll: 'Clear All Results',
    clearAllText: 'This will delete all recorded entries. This action cannot be undone.',
    delete: 'Delete',
    cancel: 'Cancel',
    save: 'Save',
    edit: 'Edit',
    undo: 'Undo',
    export: 'Export',
    clearAll: 'Clear All',
    selectAll: 'Select All',
    deleteSelected: 'Delete Selected',

    // Sync
    connected: 'Connected',
    connecting: 'Connecting...',
    offline: 'Offline',
    syncError: 'Sync error',
    syncReceived: 'Synced from cloud',
    raceId: 'Race ID',
    deviceName: 'Device Name',
    cloudSync: 'Cloud Sync',
    syncStatus: 'Sync Status',
    pendingSync: 'pending sync',

    // Feedback
    saved: 'Saved',
    deleted: 'Deleted',
    cleared: 'All entries cleared',
    undone: 'Undone',
    copied: 'Copied to clipboard',
    duplicateWarning: 'Duplicate entry detected',
    exported: 'Exported successfully',

    // GPS
    gps: 'GPS',
    gpsActive: 'GPS Active',
    gpsSearching: 'Searching for GPS...',
    gpsInactive: 'GPS Inactive',
    gpsAccuracy: 'Accuracy',

    // Settings
    simpleMode: 'Simple Mode',
    fullMode: 'Full Mode',
    autoIncrement: 'Auto-increment Bib',
    hapticFeedback: 'Haptic Feedback',
    soundFeedback: 'Sound Feedback',
    language: 'Language',
    backup: 'Backup',
    restore: 'Restore',
    importData: 'Import Data',
    exportData: 'Export Data',

    // Settings descriptions
    simpleModeDesc: 'Simplified interface for basic timing',
    cloudSyncDesc: 'Sync with other devices',
    gpsDesc: 'Use GPS for accurate timestamps',
    autoIncrementDesc: 'Increase bib number after recording',
    photoCaptureDesc: 'Capture photo on timestamp',
    hapticFeedbackDesc: 'Vibration on actions',
    soundFeedbackDesc: 'Audio confirmation',

    // Photo
    photoCapture: 'Photo Capture',
    photoCaptured: 'Photo captured',
    photoError: 'Photo capture failed',
    viewPhoto: 'View Photo',

    // Misc
    version: 'Version',
    devices: 'Devices',
    entries: 'entries',
    selected: 'selected'
  },

  de: {
    // Navigation
    timer: 'Timer',
    results: 'Ergebnisse',
    settings: 'Einstellungen',

    // Timer View
    start: 'Start',
    finish: 'Ziel',
    bib: 'Startnr.',
    point: 'Punkt',
    time: 'Zeit erfassen',
    lastRecorded: 'Zuletzt erfasst',

    // Results View
    status: 'Status',
    noEntries: 'Keine Einträge vorhanden',
    search: 'Startnr. suchen...',
    filter: 'Filter',
    all: 'Alle',
    total: 'Gesamt',
    racers: 'Fahrer',
    finished: 'Im Ziel',
    fastest: 'Schnellste',
    average: 'Durchschnitt',

    // Status
    ok: 'OK',
    dns: 'DNS',
    dnf: 'DNF',
    dsq: 'DSQ',

    // Actions
    confirmDelete: 'Eintrag löschen',
    confirmDeleteText: 'Möchten Sie diesen Eintrag wirklich löschen?',
    confirmClearAll: 'Alle löschen',
    clearAllText: 'Alle Einträge werden gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.',
    delete: 'Löschen',
    cancel: 'Abbrechen',
    save: 'Speichern',
    edit: 'Bearbeiten',
    undo: 'Rückgängig',
    export: 'Exportieren',
    clearAll: 'Alle löschen',
    selectAll: 'Alle auswählen',
    deleteSelected: 'Ausgewählte löschen',

    // Sync
    connected: 'Verbunden',
    connecting: 'Verbinde...',
    offline: 'Offline',
    syncError: 'Sync-Fehler',
    syncReceived: 'Von Cloud synchronisiert',
    raceId: 'Rennen-ID',
    deviceName: 'Gerätename',
    cloudSync: 'Cloud-Sync',
    syncStatus: 'Sync-Status',
    pendingSync: 'ausstehend',

    // Feedback
    saved: 'Gespeichert',
    deleted: 'Gelöscht',
    cleared: 'Alle Einträge gelöscht',
    undone: 'Rückgängig gemacht',
    copied: 'In Zwischenablage kopiert',
    duplicateWarning: 'Doppelter Eintrag erkannt',
    exported: 'Erfolgreich exportiert',

    // GPS
    gps: 'GPS',
    gpsActive: 'GPS Aktiv',
    gpsSearching: 'GPS wird gesucht...',
    gpsInactive: 'GPS Inaktiv',
    gpsAccuracy: 'Genauigkeit',

    // Settings
    simpleMode: 'Einfacher Modus',
    fullMode: 'Erweiterter Modus',
    autoIncrement: 'Auto-Inkrement',
    hapticFeedback: 'Haptisches Feedback',
    soundFeedback: 'Ton-Feedback',
    language: 'Sprache',
    backup: 'Sichern',
    restore: 'Wiederherstellen',
    importData: 'Daten importieren',
    exportData: 'Daten exportieren',

    // Settings descriptions
    simpleModeDesc: 'Vereinfachte Oberfläche für einfache Zeitmessung',
    cloudSyncDesc: 'Mit anderen Geräten synchronisieren',
    gpsDesc: 'GPS für genaue Zeitstempel verwenden',
    autoIncrementDesc: 'Startnummer nach Erfassung erhöhen',
    photoCaptureDesc: 'Foto bei Zeiterfassung aufnehmen',
    hapticFeedbackDesc: 'Vibration bei Aktionen',
    soundFeedbackDesc: 'Akustische Bestätigung',

    // Photo
    photoCapture: 'Foto aufnehmen',
    photoCaptured: 'Foto aufgenommen',
    photoError: 'Foto-Aufnahme fehlgeschlagen',
    viewPhoto: 'Foto anzeigen',

    // Misc
    version: 'Version',
    devices: 'Geräte',
    entries: 'Einträge',
    selected: 'ausgewählt'
  }
};

/**
 * Get translation for a key
 */
export function t(key: string, lang: Language = 'de'): string {
  return translations[lang][key] || translations['en'][key] || key;
}
