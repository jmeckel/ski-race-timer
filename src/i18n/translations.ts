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
    run: 'Run',
    run1: 'R1',
    run2: 'R2',
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
    confirmUndoAdd: 'Undo Recording',
    confirmUndoAddText: 'This will delete the recorded entry. Continue?',
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
    connected: 'Sync',
    connecting: '...',
    syncing: 'Sync',
    offline: 'X',
    syncError: '!',
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
    zeroBibWarning: 'Bib 000 - verify entry',
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
    syncedEntriesFromCloud: 'Synced {count} entries from cloud',
    crossDeviceDuplicate: 'Duplicate: Bib {bib} {point} already recorded by {device}',

    // Photo sync settings
    syncPhotos: 'Sync Photos',
    syncPhotosDesc: 'Share photos across devices via cloud',
    syncPhotosWarning: 'Enable Photo Sync',
    syncPhotosWarningText: 'Enabling photo sync will transfer the following data:',
    photosToUpload: 'Photos to upload',
    photosToDownload: 'Photos to download',
    totalDataVolume: 'Total data volume',
    enableSync: 'Enable Sync',
    noPhotosToSync: 'No photos to sync',

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
    syncRequiresPin: 'Sync disabled. Enable sync and enter PIN to reconnect.',
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
    unknownError: 'Unknown error',

    // Onboarding
    onboardingWelcome: 'Welcome to Ski Race Timer',
    onboardingWelcomeDesc: 'GPS-synchronized timing for ski races',
    getStarted: 'Get Started',
    onboardingDeviceName: 'Name Your Timer',
    onboardingDeviceNameDesc: 'This identifies your device when syncing',
    onboardingPhoto: 'Photo Documentation',
    onboardingPhotoDesc: 'Automatically capture a photo when recording each timestamp. Useful for verifying bib numbers and resolving disputes.',
    enablePhotoCapture: 'Enable Photo Capture',
    photoCaptureLabel: 'Photo Capture',
    onboardingRaceSetup: 'Join a Race',
    onboardingRaceSetupDesc: 'Enter a race ID to sync with other timers',
    skipForNow: 'Skip for now',
    onboardingReady: 'Ready to Time!',
    onboardingTip: 'Tap the big blue button to record timestamps',
    startTiming: 'Start Timing',
    continue: 'Continue',
    deviceNameLabel: 'Device Name',
    raceIdLabel: 'Race ID',
    syncStatusLabel: 'Cloud Sync',
    enabled: 'Enabled',
    disabled: 'Disabled',
    showTutorial: 'Show Tutorial',
    showTutorialDesc: 'Run the setup wizard again',
    show: 'Show',
    onboardingComplete: 'Setup complete!',
    invalidPin: 'Invalid PIN format',
    recentRaces: 'Recent Races',
    noRecentRaces: 'No races from today',
    errorOccurred: 'Something went wrong',
    errorRecoveryMessage: 'The app encountered an error. You can dismiss this and continue, or reload the app.',
    dismiss: 'Dismiss',
    reload: 'Reload',
    operationFailed: 'Operation failed'
  },

  de: {
    // Navigation
    timer: 'Timer',
    results: 'Ergebnisse',
    settings: 'Einstellungen',

    // Timer View
    start: 'Start',
    finish: 'Ziel',
    bib: 'Startnummer',
    point: 'Punkt',
    run: 'Lauf',
    run1: 'L1',
    run2: 'L2',
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
    confirmUndoAdd: 'Erfassung rückgängig',
    confirmUndoAddText: 'Der erfasste Eintrag wird gelöscht. Fortfahren?',
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
    connected: 'Sync',
    connecting: '...',
    syncing: 'Sync',
    offline: 'X',
    syncError: '!',
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
    zeroBibWarning: 'Startnr. 000 - Eintrag prüfen',
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
    syncedEntriesFromCloud: '{count} Einträge aus Cloud synchronisiert',
    crossDeviceDuplicate: 'Duplikat: Startnr. {bib} {point} bereits von {device} erfasst',

    // Photo sync settings
    syncPhotos: 'Fotos synchronisieren',
    syncPhotosDesc: 'Fotos über Cloud mit anderen Geräten teilen',
    syncPhotosWarning: 'Foto-Sync aktivieren',
    syncPhotosWarningText: 'Aktivierung der Foto-Synchronisierung überträgt folgende Daten:',
    photosToUpload: 'Fotos hochzuladen',
    photosToDownload: 'Fotos herunterzuladen',
    totalDataVolume: 'Gesamtes Datenvolumen',
    enableSync: 'Sync aktivieren',
    noPhotosToSync: 'Keine Fotos zu synchronisieren',

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
    syncRequiresPin: 'Sync deaktiviert. Aktivieren Sie Sync und geben Sie die PIN ein.',
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
    unknownError: 'Unbekannter Fehler',

    // Onboarding
    onboardingWelcome: 'Willkommen bei Ski Race Timer',
    onboardingWelcomeDesc: 'GPS-synchronisierte Zeitmessung für Skirennen',
    getStarted: "Los geht's",
    onboardingDeviceName: 'Timer benennen',
    onboardingDeviceNameDesc: 'Dieser Name identifiziert dein Gerät beim Synchronisieren',
    onboardingPhoto: 'Foto-Dokumentation',
    onboardingPhotoDesc: 'Automatisch ein Foto bei jeder Zeiterfassung aufnehmen. Nützlich zur Überprüfung von Startnummern und bei Unstimmigkeiten.',
    enablePhotoCapture: 'Foto-Aufnahme aktivieren',
    photoCaptureLabel: 'Foto-Aufnahme',
    onboardingRaceSetup: 'Rennen beitreten',
    onboardingRaceSetupDesc: 'Gib eine Rennen-ID ein um mit anderen Timern zu synchronisieren',
    skipForNow: 'Vorerst überspringen',
    onboardingReady: 'Bereit zur Zeitmessung!',
    onboardingTip: 'Tippe auf den großen blauen Button um Zeiten zu erfassen',
    startTiming: 'Zeitmessung starten',
    continue: 'Weiter',
    deviceNameLabel: 'Gerätename',
    raceIdLabel: 'Rennen-ID',
    syncStatusLabel: 'Cloud-Sync',
    enabled: 'Aktiviert',
    disabled: 'Deaktiviert',
    showTutorial: 'Tutorial anzeigen',
    showTutorialDesc: 'Setup-Assistenten erneut starten',
    show: 'Anzeigen',
    onboardingComplete: 'Einrichtung abgeschlossen!',
    invalidPin: 'Ungültiges PIN-Format',
    recentRaces: 'Letzte Rennen',
    noRecentRaces: 'Keine Rennen von heute',
    errorOccurred: 'Ein Fehler ist aufgetreten',
    errorRecoveryMessage: 'Die App hat einen Fehler festgestellt. Sie können diesen Hinweis schließen und fortfahren, oder die App neu laden.',
    dismiss: 'Schließen',
    reload: 'Neu laden',
    operationFailed: 'Vorgang fehlgeschlagen'
  }
};

/**
 * Get translation for a key
 */
export function t(key: string, lang: Language = 'de'): string {
  return translations[lang][key] || translations['en'][key] || key;
}
