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
    close: 'Close',
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
    syncing: 'Syncing...',
    offline: 'Offline',
    syncError: 'Sync error',
    syncReceived: 'Synced from cloud',
    raceId: 'Race ID',
    invalidRaceId: 'Invalid Race ID. Use letters, numbers, hyphens, underscores only.',
    deviceName: 'Time Keeper ID',
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
    deletePhoto: 'Delete Photo',
    photoFor: 'Photo for Bib',
    noPhotoAvailable: 'No photo available',
    photoDeleted: 'Photo deleted',

    // Race Change
    raceChangeTitle: 'Change Race',
    raceChangeSyncedText: 'You have results from another race. Export or delete them before switching?',
    raceChangeUnsyncedText: 'You have existing results. Keep them or delete before switching?',
    keepResults: 'Keep',

    // Misc
    version: 'Version',
    devices: 'Devices',
    entries: 'entries',
    selected: 'selected',

    // Race exists indicator
    raceFound: 'Race found',
    raceNew: 'New race',
    entriesInCloud: 'entries in cloud',

    // Photo sync
    photoTooLarge: 'Photo too large for sync',

    // Race Management
    admin: 'Admin',
    adminPin: 'Race Management PIN',
    adminPinDesc: 'Required to manage and sync races',
    manageRaces: 'Manage Races',
    manageRacesDesc: 'View and delete synced races',
    manage: 'Manage',
    enterAdminPin: 'Enter Race Management PIN',
    enterPinText: 'Enter your PIN to access race management.',
    enterPinToJoinRace: 'Enter your PIN to join this race.',
    incorrectPin: 'Incorrect PIN',
    verify: 'Verify',
    setPinFirst: 'Please set a Race Management PIN first',
    pinSaved: 'PIN saved',
    pinCleared: 'PIN cleared',
    pinNotSet: 'Not set',
    pinSet: 'PIN set',
    setPin: 'Set PIN',
    changePin: 'Change PIN',
    currentPin: 'Current PIN',
    newPin: 'New PIN (4 digits)',
    confirmPin: 'Confirm PIN',
    pinMismatch: 'PINs do not match',
    pinFormatError: 'PIN must be exactly 4 digits',
    loading: 'Loading...',
    noRaces: 'No active races',
    refresh: 'Refresh',
    raceDeleted: 'Race Deleted',
    raceDeletedText: 'This race has been deleted by an administrator.',
    raceDeletedFor: 'Race deleted:',
    raceDeletedSuccess: 'Race deleted:',
    confirmDeleteRace: 'Delete Race',
    confirmDeleteRaceText: 'Are you sure you want to delete race',
    loadError: 'Failed to load races',
    deleteError: 'Failed to delete race',
    entry: 'entry',
    device: 'device',

    // Storage errors
    storageError: 'Failed to save data - check storage',
    storageQuotaError: 'Storage full! Export data immediately',
    storageWarning: 'Storage almost full',

    // Network errors
    networkError: 'Network error - check connection',
    connectionFailed: 'Connection failed',
    serverUnavailable: 'Server unavailable',
    rateLimitError: 'Too many requests - please wait',
    authError: 'Authentication failed',

    // Sync errors
    syncFailed: 'Sync failed',
    pinSyncFailed: 'PIN not synced to cloud',

    // Camera errors
    cameraError: 'Camera error',
    cameraPermissionDenied: 'Camera access denied',

    // GPS errors
    gpsError: 'GPS error',
    gpsPermissionDenied: 'GPS access denied',
    gpsUnavailable: 'GPS unavailable',

    // Generic errors
    unknownError: 'Unknown error'
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
    close: 'Schließen',
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
    syncing: 'Synchronisiere...',
    offline: 'Offline',
    syncError: 'Sync-Fehler',
    syncReceived: 'Von Cloud synchronisiert',
    raceId: 'Rennen-ID',
    invalidRaceId: 'Ungültige Rennen-ID. Nur Buchstaben, Zahlen, Bindestriche, Unterstriche.',
    deviceName: 'Zeitnehmer-ID',
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
    deletePhoto: 'Foto löschen',
    photoFor: 'Foto für Startnr.',
    noPhotoAvailable: 'Kein Foto verfügbar',
    photoDeleted: 'Foto gelöscht',

    // Race Change
    raceChangeTitle: 'Rennen wechseln',
    raceChangeSyncedText: 'Es gibt Ergebnisse von einem anderen Rennen. Exportieren oder löschen?',
    raceChangeUnsyncedText: 'Es gibt bestehende Ergebnisse. Behalten oder löschen?',
    keepResults: 'Behalten',

    // Misc
    version: 'Version',
    devices: 'Geräte',
    entries: 'Einträge',
    selected: 'ausgewählt',

    // Race exists indicator
    raceFound: 'Rennen gefunden',
    raceNew: 'Neues Rennen',
    entriesInCloud: 'Einträge in der Cloud',

    // Photo sync
    photoTooLarge: 'Foto zu groß für Sync',

    // Race Management
    admin: 'Admin',
    adminPin: 'Rennverwaltungs-PIN',
    adminPinDesc: 'Erforderlich für Verwaltung und Sync',
    manageRaces: 'Rennen verwalten',
    manageRacesDesc: 'Synchronisierte Rennen anzeigen und löschen',
    manage: 'Verwalten',
    enterAdminPin: 'Rennverwaltungs-PIN eingeben',
    enterPinText: 'Geben Sie Ihre PIN ein, um die Rennverwaltung zu öffnen.',
    enterPinToJoinRace: 'Geben Sie Ihre PIN ein, um diesem Rennen beizutreten.',
    incorrectPin: 'Falsche PIN',
    verify: 'Bestätigen',
    setPinFirst: 'Bitte zuerst Rennverwaltungs-PIN festlegen',
    pinSaved: 'PIN gespeichert',
    pinCleared: 'PIN gelöscht',
    pinNotSet: 'Nicht gesetzt',
    pinSet: 'PIN gesetzt',
    setPin: 'PIN setzen',
    changePin: 'PIN ändern',
    currentPin: 'Aktuelle PIN',
    newPin: 'Neue PIN (4 Ziffern)',
    confirmPin: 'PIN bestätigen',
    pinMismatch: 'PINs stimmen nicht überein',
    pinFormatError: 'PIN muss genau 4 Ziffern haben',
    loading: 'Laden...',
    noRaces: 'Keine aktiven Rennen',
    refresh: 'Aktualisieren',
    raceDeleted: 'Rennen gelöscht',
    raceDeletedText: 'Dieses Rennen wurde von einem Administrator gelöscht.',
    raceDeletedFor: 'Rennen gelöscht:',
    raceDeletedSuccess: 'Rennen gelöscht:',
    confirmDeleteRace: 'Rennen löschen',
    confirmDeleteRaceText: 'Möchten Sie das Rennen wirklich löschen',
    loadError: 'Fehler beim Laden der Rennen',
    deleteError: 'Fehler beim Löschen des Rennens',
    entry: 'Eintrag',
    device: 'Gerät',

    // Storage errors
    storageError: 'Speichern fehlgeschlagen - Speicher prüfen',
    storageQuotaError: 'Speicher voll! Daten sofort exportieren',
    storageWarning: 'Speicher fast voll',

    // Network errors
    networkError: 'Netzwerkfehler - Verbindung prüfen',
    connectionFailed: 'Verbindung fehlgeschlagen',
    serverUnavailable: 'Server nicht erreichbar',
    rateLimitError: 'Zu viele Anfragen - bitte warten',
    authError: 'Authentifizierung fehlgeschlagen',

    // Sync errors
    syncFailed: 'Synchronisierung fehlgeschlagen',
    pinSyncFailed: 'PIN nicht in Cloud gespeichert',

    // Camera errors
    cameraError: 'Kamerafehler',
    cameraPermissionDenied: 'Kamerazugriff verweigert',

    // GPS errors
    gpsError: 'GPS-Fehler',
    gpsPermissionDenied: 'GPS-Zugriff verweigert',
    gpsUnavailable: 'GPS nicht verfügbar',

    // Generic errors
    unknownError: 'Unbekannter Fehler'
  }
};

/**
 * Get translation for a key
 */
export function t(key: string, lang: Language = 'de'): string {
  return translations[lang][key] || translations['en'][key] || key;
}
