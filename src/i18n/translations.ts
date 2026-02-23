import type { Language, Translations } from '../types';

export const translations = {
  en: {
    // Navigation
    timer: 'Timer',
    results: 'Results',
    settings: 'Settings',

    // Timer View
    start: 'Start',
    finish: 'Finish',
    startShort: 'S',
    finishShort: 'F',
    bib: 'Bib',
    point: 'Point',
    run: 'Run',
    run1: 'R1',
    run2: 'R2',
    runLabel1: 'Run 1',
    runLabel2: 'Run 2',
    time: 'Record time',
    lastRecorded: 'Last recorded',
    lastRecordedShort: 'Last:',
    advancedSettings: 'Advanced Settings',

    // Results View
    status: 'Status',
    noEntries: 'No entries recorded',
    noEntriesHint: 'Record times on the Timer tab',
    search: 'Search by bib...',
    searchResults: 'Search results',
    filter: 'Filter',
    all: 'All',
    total: 'Total',
    racers: 'Racers',
    finished: 'Finished',
    entriesRecorded: 'entries recorded',
    fastest: 'Fastest',
    average: 'Average',
    timeEntry: 'time',
    timeEntries: 'times',
    faultEntry: 'fault',
    faultEntries: 'faults',

    // Status
    ok: 'OK',
    dns: 'DNS',
    dnf: 'DNF',
    dsq: 'DSQ',

    // Actions
    confirmDelete: 'Delete Entry',
    confirmDeleteText: 'Are you sure you want to delete this entry?',
    confirmDeleteFault: 'Delete this fault?',
    confirmClearAll: 'Clear All Results',
    clearAllText:
      'This will delete all recorded entries. This action cannot be undone.',
    confirmUndoAdd: 'Undo Recording',
    confirmUndoAddText: 'This will delete the recorded entry. Continue?',
    delete: 'Delete',
    cancel: 'Cancel',
    close: 'Close',
    back: 'Back',
    save: 'Save',
    saving: 'Saving...',
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
    invalidRaceId:
      'Invalid Race ID. Use letters, numbers, hyphens, underscores only.',
    deviceName: 'Time Keeper ID',
    cloudSync: 'Cloud Sync',
    syncStatus: 'Sync Status',
    pendingSync: 'pending sync',
    raceSetup: 'Race Setup',
    raceSetupDesc: 'Required for multi-device timing and syncing.',
    firstGateLabel: 'First gate',

    // Feedback
    saved: 'Saved',
    deleted: 'Deleted',
    cleared: 'All entries cleared',
    undone: 'Undone',
    copied: 'Copied to clipboard',
    debugInfoCopied: 'Debug info copied to clipboard',
    debugInfoCopyFailed: 'Tap and hold to copy debug info',
    duplicateWarning: 'Duplicate entry detected',
    zeroBibWarning: 'Bib 000 - verify entry',
    exported: 'Exported successfully',

    // GPS
    gps: 'GPS',
    gpsActive: 'GPS Active',
    gpsSearching: 'Searching for GPS...',
    gpsInactive: 'GPS Inactive',
    gpsAccuracy: 'Accuracy',

    // Settings groups
    settingsRaceSetup: 'Race Setup',
    settingsTimingGroup: 'Timing',
    settingsSyncGroup: 'Sync',
    settingsFeedbackGroup: 'Feedback',
    settingsDisplayGroup: 'Display',

    // Settings
    simpleMode: 'Simple Mode',
    fullMode: 'Full Mode',
    autoIncrement: 'Auto-increment Bib',
    hapticFeedback: 'Haptic Feedback',
    soundFeedback: 'Sound Feedback',
    language: 'Language',
    advancedSettingsHint:
      'These options can affect timing accuracy. Change only if needed.',

    // Settings descriptions
    simpleModeDesc: 'Simplified interface for basic timing',
    cloudSyncDesc: 'Sync with other devices',
    gpsDesc: 'Use GPS for accurate timestamps',
    autoIncrementDesc: 'Increase bib number after recording',
    photoCaptureDesc: 'Capture photo on timestamp',
    hapticFeedbackDesc: 'Vibration on actions',
    soundFeedbackDesc: 'Audio confirmation',
    ambientMode: 'Ambient Mode',
    ambientModeDesc: 'Auto-dim after 30s inactivity',

    // Photo
    photoCapture: 'Photo Capture',
    photoCaptured: 'Photo captured',
    photoError: 'Photo capture failed',
    photoSaveFailed: 'Photo storage failed',
    viewPhoto: 'View Photo',
    deletePhoto: 'Delete Photo',
    photoFor: 'Photo for Bib',
    noPhotoAvailable: 'No photo available',
    photoDeleted: 'Photo deleted',

    // Race Change
    raceChangeTitle: 'Change Race',
    raceChangeSyncedText:
      'You have results from another race. Export or delete them before switching?',
    raceChangeUnsyncedText:
      'You have existing results. Keep them or delete before switching?',
    keepResults: 'Keep',

    // Misc
    version: 'Version',
    devices: 'Devices',
    entries: 'entries',
    selected: 'selected',

    // Race exists indicator
    raceFound: 'Race found',
    raceNew: 'New race',
    entryInCloud: 'entry in cloud',
    entriesInCloud: 'entries in cloud',

    // Photo sync
    photoTooLarge: 'Photo too large for sync',
    syncedEntriesFromCloud: 'Synced {count} entries from cloud',
    syncedFaultsFromCloud: 'Synced {count} faults from cloud',
    crossDeviceDuplicate:
      'Duplicate: Bib {bib} {point} already recorded by {device}',

    // Photo sync settings
    syncPhotos: 'Sync Photos',
    syncPhotosDesc: 'Share photos across devices via cloud',
    syncPhotosWarning: 'Enable Photo Sync',
    syncPhotosWarningText:
      'Enabling photo sync will transfer the following data:',
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
    enterPinForChiefJudge: 'Enter your PIN to access Chief Judge mode.',
    enterChiefJudgePin: 'Enter Chief Judge PIN',
    enterPinForChiefJudgeInfo:
      'Chief Judge mode requires a separate PIN. First use sets the PIN.',
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
    noRacesHint: 'Create one in Settings',
    cleanRunHint: 'Clean run so far',
    refresh: 'Refresh',
    raceDeleted: 'Race Deleted',
    raceDeletedText: 'This race has been deleted by an administrator.',
    raceDeletedFor: 'Race deleted:',
    raceDeletedSuccess: 'Race deleted:',
    confirmDeleteRace: 'Delete Race',
    confirmDeleteRaceText: 'Are you sure you want to delete race',
    loadError: 'Failed to load races. Check your connection and try again.',
    deleteError: 'Failed to delete race',
    entry: 'entry',
    device: 'device',

    // Storage errors
    storageError: 'Failed to save data - check storage',
    storageQuotaError: 'Storage full! Export data immediately',
    storageWarning: 'Storage almost full',
    storageNearlyFull:
      'Storage nearly full. Export data and clear old entries.',

    // Network errors
    networkError: 'Network error - check connection',
    connectionFailed: 'Connection failed',
    serverUnavailable: 'Server unavailable',
    rateLimitError: 'Too many requests - please wait',
    authError: 'Authentication failed. Try re-entering your PIN.',

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

    // Wake Lock errors
    wakeLockFailed: 'Screen may dim during timing',
    wakeLockIdleTimeout: 'Screen will dim to save battery. Tap to keep awake.',

    // Generic errors
    unknownError: 'Unknown error',

    // Onboarding
    onboardingWelcome: 'Welcome to CHRONO',
    onboardingWelcomeDesc: 'GPS-synchronized timing for ski races',
    getStarted: 'Get Started',
    skipSetup: 'Skip',
    onboardingRole: "What's Your Role?",
    onboardingRoleDesc: "Choose how you'll be helping at the race",
    roleTimerTitle: 'Timer',
    roleTimerDesc: 'You will record start and finish times',
    roleJudgeTitle: 'Gate Judge',
    roleJudgeDesc: 'You will record gate faults (Torrichter)',
    onboardingDeviceName: 'Name Your Timer',
    onboardingDeviceNameDesc: 'This identifies your device when syncing',
    onboardingDeviceNameJudge: 'Your Name',
    onboardingDeviceNameJudgeDesc: 'This identifies you as the gate judge',
    onboardingPhoto: 'Photo Documentation',
    onboardingPhotoDesc:
      'Automatically capture a photo when recording each timestamp. Useful for verifying bib numbers and resolving disputes.',
    enablePhotoCapture: 'Enable Photo Capture',
    photoCaptureLabel: 'Photo Capture',
    onboardingGates: 'Your Gate Assignment',
    onboardingGatesDesc:
      "Enter the gate numbers you'll be watching. You can change this later.",
    onboardingRaceSetup: 'Join a Race',
    onboardingRaceSetupDesc: 'Enter a race ID to sync with other timers',
    skipForNow: 'Skip for now',
    onboardingReady: 'Ready to Time!',
    onboardingReadyJudge: 'Ready to Judge!',
    onboardingTip: 'Tap the big blue button to record timestamps',
    onboardingTipJudge: "Tap a racer's bib to record a fault",
    startTiming: 'Start Timing',
    startJudging: 'Start Judging',
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
    invalidPin: 'PIN must be 4 digits',
    recentRaces: 'Recent Races',
    noRecentRaces: 'No races from today',
    errorOccurred: 'Something went wrong',
    errorRecoveryMessage:
      'The app encountered an error. You can dismiss this and continue, or reload the app.',
    dismiss: 'Dismiss',
    reload: 'Reload',
    updateAvailable: 'Update available! Reload to get the latest version.',
    operationFailed: 'Operation failed. Please try again.',
    raceIdPlaceholder: 'RACE-001',
    deviceNamePlaceholder: 'Timer 1',
    photoForBib: 'Photo for bib',

    // Gate Judge
    gateJudge: 'Gate Judge',
    gateJudgeTab: 'Gate',
    deviceRole: 'Device Role',
    deviceRoleDesc: 'Timer records times, Gate Judge records faults',
    roleTimer: 'Timer',
    roleGateJudge: 'Gate Judge',
    gateAssignment: 'Gate Assignment',
    noGateAssignment: 'No gate assignment. Please set your gate range first.',
    gates: 'Gates',
    gatesFrom: 'From',
    gatesTo: 'To',
    firstGateColor: 'Color of first gate',
    colorRed: 'Red',
    colorBlue: 'Blue',
    changeGates: 'Change',
    otherJudges: 'Other judges:',
    activeBibs: 'On Course',
    noBibsOnCourse: 'No racers on course',
    recordFault: 'Record Fault',
    faultType: 'Fault Type',
    faultMG: 'Missed Gate',
    faultSTR: 'Straddling',
    faultBR: 'Binding Release',
    faultMGShort: 'MG',
    faultSTRShort: 'STR',
    faultBRShort: 'BR',
    orEnterManually: 'or enter:',
    faultRecorded: 'Fault recorded',
    signalReady: 'Ready',
    judgeReady: 'Ready for race!',
    judgeNotReady: 'Ready status cleared',
    faultDeleted: 'Fault deleted',
    recordedFaults: 'Recorded Faults',
    selectBib: 'Select Bib',
    selectGate: 'Gate',
    gate: 'Gate',
    noFaults: 'No faults recorded',
    faultsFor: 'Faults for',
    faultSummary: 'Fault Summary',
    penaltyTime: 'Penalty',
    faultCount: 'faults',
    markOk: 'Mark OK',
    saveFault: 'Save Fault',
    selectFaultType: 'Please select a fault type',
    gateOutOfRange: 'Gate is outside assigned range',
    flt: 'FLT',
    statusFlt: 'Fault Penalty',

    // Chief Judge
    chiefJudge: 'Chief Judge',
    noFaultsRecorded: 'No faults recorded',
    finalize: 'Finalize',
    finalized: 'Finalized',
    chiefJudgeMode: 'Chief Judge Mode',
    chiefJudgeModeEnabled: 'Chief Judge mode enabled',
    chiefJudgeModeDisabled: 'Chief Judge mode disabled',
    racersWithFaults: 'Racers with faults',
    penaltyMode: '+Time',
    gateJudges: 'Gate Judges',
    noJudgesConnected: 'No gate judges connected',
    summary: 'Summary',

    // Export
    exportCSV: 'CSV',
    exportWhatsApp: 'WhatsApp',
    noFaultsToExport: 'No faults to export',
    copiedToClipboard: 'Copied to clipboard',
    gateJudgeCard: 'Gate Judge Card',
    race: 'Race',
    date: 'Date',
    gateJudgeLabel: 'Gate Judge',
    runLabel: 'Run',
    noFaultsEntered: 'No faults entered',
    signature: 'Signature',
    legend: 'Legend',
    missedGateLegend: 'Missed',
    straddlingLegend: 'Straddling',
    bindingLegend: 'Binding',
    gateFaults: 'Gate Faults',
    penaltyLabel: 'PENALTY',
    faultSummaryTitle: 'GATE FAULT SUMMARY',
    faults: 'Faults',
    penalty: 'Penalty',
    sec: 'sec',
    generated: 'Generated',

    // Fault Edit & Version History
    editFault: 'Edit Fault',
    versionHistory: 'Version History',
    restoreVersion: 'Restore Selected Version',
    currentVersion: 'Current',
    originalVersion: 'Original',
    restored: 'Restored',
    versionRestored: 'Version restored',

    // Deletion Workflow
    markForDeletion: 'Mark for Deletion',
    markForDeletionText:
      'This fault will be marked for deletion and requires Chief Judge approval to permanently delete.',
    markedForDeletion: 'Marked for deletion',
    deletionPending: 'Deletion pending',
    pendingDeletions: 'Pending Deletions',
    approveDeletion: 'Approve Deletion',
    rejectDeletion: 'Reject Deletion',
    deletionMarkedBy: 'Marked by',
    deletionApproved: 'Deletion approved',
    deletionRejected: 'Deletion rejected',
    cannotEditPendingDeletion: 'Cannot edit fault pending deletion',

    // Voice Mode
    voiceMode: 'Voice Mode',
    voiceModeDesc: 'Hands-free voice commands (requires internet)',
    voiceListening: 'Listening...',
    voiceProcessing: 'Processing...',
    voiceConfirming: 'Confirm?',
    voiceOffline: 'Voice unavailable offline',
    voiceNotSupported: 'Voice not supported in this browser',
    voicePermissionDenied: 'Microphone access denied',
    voiceOK: 'OK',
    voiceRecorded: 'Recorded',
    voiceNotUnderstood: 'Not understood',
    voiceCancelled: 'Cancelled',
    voiceError: 'Voice error',
    voiceApiKeyRequired: 'API key required for voice mode',

    // Localization - Pull to Refresh
    pullToRefresh: 'Pull to refresh',
    releaseToRefresh: 'Release to refresh',

    // Localization - Sync Status
    synced: 'Synced',
    syncingStatus: 'Syncing...',

    // Localization - Gate Assignment Modal
    gateAssignmentInstructions: 'Enter the gate range you are responsible for:',

    // Localization - Ready Status
    readySuffix: ' - Ready',

    // Localization - Aria Labels
    viewPhotoLabel: 'View photo',
    editEntryLabel: 'Edit entry',
    deleteEntryLabel: 'Delete entry',
    editFaultLabel: 'Edit fault',
    deleteFaultLabel: 'Delete fault',
    deleteLabel: 'Delete',
    gateNumberLabel: 'Gate',
    numberLabel: 'Number',
    currentTime: 'Current time',

    // Localization - PIN Verification
    pinVerifyOnline: 'PIN will be verified when online',

    // Voice Notes
    addNote: 'Add Note',
    done: 'Done',
    recordNote: 'Record Note',
    listening: 'Listening...',
    noteSaved: 'Note saved',
    noteDeleted: 'Note deleted',
    noteCharCount: 'characters',
    voiceNoteUnsupported: 'Voice input not supported in this browser',
    voiceNoteError: 'Voice input error',
    typeNote: 'Type or speak your note...',
    hasNote: 'Has note',
    noteTextLabel: 'Note text',
    recordVoiceNoteLabel: 'Record voice note',

    // Indicator labels
    syncOnline: 'Sync online',
    syncOffline: 'Offline',
    syncShortConnected: 'Sync',
    syncShortSyncing: 'Sync...',
    syncShortError: 'Error',
    syncShortOff: 'Off',
    syncDeviceAbbrev: 'dev',

    // Auth
    sessionExpired: 'Session expired. Please re-enter your PIN.',
    authSuccess: 'Authentication successful',

    // Keyboard Shortcuts
    keyboardShortcuts: 'Keyboard Shortcuts',
    keyboardShortcutsDesc: 'Show all keyboard shortcuts',
    shortcutSection_timer: 'Timer',
    shortcutSection_gateJudge: 'Gate Judge',
    shortcutSection_results: 'Results',
    shortcutSection_global: 'Global',
    shortcut_enterDigit: 'Enter bib digit',
    shortcut_selectStart: 'Select Start',
    shortcut_selectFinish: 'Select Finish',
    shortcut_selectRun1: 'Select Run 1',
    shortcut_selectRun2: 'Select Run 2',
    shortcut_recordTime: 'Record timestamp',
    shortcut_clearBib: 'Clear bib',
    shortcut_deleteLastDigit: 'Delete last digit',
    shortcut_missedGate: 'Missed Gate',
    shortcut_straddled: 'Straddled',
    shortcut_broken: 'Broken gate',
    shortcut_selectGate: 'Select gate',
    shortcut_navigateBtns: 'Navigate buttons',
    shortcut_confirmSelection: 'Confirm selection',
    shortcut_navigateItems: 'Navigate items',
    shortcut_editItem: 'Edit item',
    shortcut_deleteItem: 'Delete item',
    shortcut_moveTab: 'Move between tabs',
    shortcut_closeModal: 'Close modal',
    shortcut_navigateInComponent: 'Navigate in component',
    shortcut_showShortcuts: 'Show shortcuts',

    // Offline/online banner
    offlineBanner: 'You are offline. Times will be saved locally.',
    onlineRestored: 'Back online',

    // Undo toast
    entryDeleted: 'Entry deleted',
    undoAction: 'Undo',

    // Multi-device duplicates
    multiDeviceDuplicate: 'Multi-device',
    duplicateDevices: '{count} devices',
    duplicateCount: '{count} duplicates',
  },

  de: {
    // Navigation
    timer: 'Timer',
    results: 'Ergebnisse',
    settings: 'Einstellungen',

    // Timer View
    start: 'Start',
    finish: 'Ziel',
    startShort: 'S',
    finishShort: 'Z',
    bib: 'Startnr.',
    point: 'Punkt',
    run: 'Lauf',
    run1: 'L1',
    run2: 'L2',
    runLabel1: 'Lauf 1',
    runLabel2: 'Lauf 2',
    time: 'Zeit erfassen',
    lastRecorded: 'Zuletzt erfasst',
    lastRecordedShort: 'Letzter:',
    advancedSettings: 'Erweiterte Einstellungen',

    // Results View
    status: 'Status',
    noEntries: 'Keine Einträge vorhanden',
    noEntriesHint: 'Zeiten im Timer-Tab aufnehmen',
    search: 'Startnr. suchen...',
    searchResults: 'Ergebnisse durchsuchen',
    filter: 'Filter',
    all: 'Alle',
    total: 'Gesamt',
    racers: 'Fahrer',
    finished: 'Im Ziel',
    entriesRecorded: 'Einträge erfasst',
    fastest: 'Schnellste',
    average: 'Durchschnitt',
    timeEntry: 'Zeit',
    timeEntries: 'Zeiten',
    faultEntry: 'Fehler',
    faultEntries: 'Fehler',

    // Status
    ok: 'OK',
    dns: 'DNS',
    dnf: 'DNF',
    dsq: 'DSQ',

    // Actions
    confirmDelete: 'Eintrag löschen',
    confirmDeleteText: 'Möchten Sie diesen Eintrag wirklich löschen?',
    confirmDeleteFault: 'Diesen Fehler löschen?',
    confirmClearAll: 'Alle löschen',
    clearAllText:
      'Alle Einträge werden gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.',
    confirmUndoAdd: 'Erfassung rückgängig',
    confirmUndoAddText: 'Der erfasste Eintrag wird gelöscht. Fortfahren?',
    delete: 'Löschen',
    cancel: 'Abbrechen',
    close: 'Schließen',
    back: 'Zurück',
    save: 'Speichern',
    saving: 'Speichern...',
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
    invalidRaceId:
      'Ungültige Rennen-ID. Nur Buchstaben, Zahlen, Bindestriche, Unterstriche.',
    deviceName: 'Zeitnehmer-ID',
    cloudSync: 'Cloud-Sync',
    syncStatus: 'Sync-Status',
    pendingSync: 'ausstehend',
    raceSetup: 'Rennen einrichten',
    raceSetupDesc: 'Erforderlich für Timing und Sync über mehrere Geräte.',
    firstGateLabel: 'Erstes Tor',

    // Feedback
    saved: 'Gespeichert',
    deleted: 'Gelöscht',
    cleared: 'Alle Einträge gelöscht',
    undone: 'Rückgängig gemacht',
    copied: 'In Zwischenablage kopiert',
    debugInfoCopied: 'Debug-Info in Zwischenablage kopiert',
    debugInfoCopyFailed: 'Lange drücken um Debug-Info zu kopieren',
    duplicateWarning: 'Doppelter Eintrag erkannt',
    zeroBibWarning: 'Startnr. 000 - Eintrag prüfen',
    exported: 'Erfolgreich exportiert',

    // GPS
    gps: 'GPS',
    gpsActive: 'GPS Aktiv',
    gpsSearching: 'GPS wird gesucht...',
    gpsInactive: 'GPS Inaktiv',
    gpsAccuracy: 'Genauigkeit',

    // Settings groups
    settingsRaceSetup: 'Rennen einrichten',
    settingsTimingGroup: 'Zeitmessung',
    settingsSyncGroup: 'Synchronisation',
    settingsFeedbackGroup: 'Rückmeldung',
    settingsDisplayGroup: 'Anzeige',

    // Settings
    simpleMode: 'Einfacher Modus',
    fullMode: 'Erweiterter Modus',
    autoIncrement: 'Startnr. automatisch',
    hapticFeedback: 'Vibration',
    soundFeedback: 'Signalton',
    language: 'Sprache',
    advancedSettingsHint:
      'Diese Optionen beeinflussen die Zeitmessung. Nur bei Bedarf ändern.',

    // Settings descriptions
    simpleModeDesc: 'Vereinfachte Oberfläche für einfache Zeitmessung',
    cloudSyncDesc: 'Mit anderen Geräten synchronisieren',
    gpsDesc: 'GPS für genaue Zeitstempel verwenden',
    autoIncrementDesc: 'Startnr. nach Erfassung erhöhen',
    photoCaptureDesc: 'Foto bei Zeiterfassung aufnehmen',
    hapticFeedbackDesc: 'Vibration bei Aktionen',
    soundFeedbackDesc: 'Akustische Bestätigung',
    ambientMode: 'Ruhemodus',
    ambientModeDesc: 'Nach 30s Inaktivität abdunkeln',

    // Photo
    photoCapture: 'Foto aufnehmen',
    photoCaptured: 'Foto aufgenommen',
    photoError: 'Foto-Aufnahme fehlgeschlagen',
    photoSaveFailed: 'Foto-Speicherung fehlgeschlagen',
    viewPhoto: 'Foto anzeigen',
    deletePhoto: 'Foto löschen',
    photoFor: 'Foto für Startnr.',
    noPhotoAvailable: 'Kein Foto verfügbar',
    photoDeleted: 'Foto gelöscht',

    // Race Change
    raceChangeTitle: 'Rennen wechseln',
    raceChangeSyncedText:
      'Es gibt Ergebnisse von einem anderen Rennen. Exportieren oder löschen?',
    raceChangeUnsyncedText:
      'Es gibt bestehende Ergebnisse. Behalten oder löschen?',
    keepResults: 'Behalten',

    // Misc
    version: 'Version',
    devices: 'Geräte',
    entries: 'Einträge',
    selected: 'ausgewählt',

    // Race exists indicator
    raceFound: 'Rennen gefunden',
    raceNew: 'Neues Rennen',
    entryInCloud: 'Eintrag in der Cloud',
    entriesInCloud: 'Einträge in der Cloud',

    // Photo sync
    photoTooLarge: 'Foto zu groß für Sync',
    syncedEntriesFromCloud: '{count} Einträge aus Cloud synchronisiert',
    syncedFaultsFromCloud: '{count} Torfehler aus Cloud synchronisiert',
    crossDeviceDuplicate:
      'Duplikat: Startnr. {bib} {point} bereits von {device} erfasst',

    // Photo sync settings
    syncPhotos: 'Fotos synchronisieren',
    syncPhotosDesc: 'Fotos über Cloud mit anderen Geräten teilen',
    syncPhotosWarning: 'Foto-Sync aktivieren',
    syncPhotosWarningText:
      'Aktivierung der Foto-Synchronisierung überträgt folgende Daten:',
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
    enterPinForChiefJudge:
      'Geben Sie Ihre PIN ein, um die Obmann-Ansicht zu öffnen.',
    enterChiefJudgePin: 'Obmann-PIN eingeben',
    enterPinForChiefJudgeInfo:
      'Der Obmann-Modus erfordert eine separate PIN. Erste Eingabe setzt die PIN.',
    syncRequiresPin:
      'Sync deaktiviert. Aktivieren Sie Sync und geben Sie die PIN ein.',
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
    noRacesHint: 'In Einstellungen erstellen',
    cleanRunHint: 'Bisher fehlerfreie Fahrt',
    refresh: 'Aktualisieren',
    raceDeleted: 'Rennen gelöscht',
    raceDeletedText: 'Dieses Rennen wurde von einem Administrator gelöscht.',
    raceDeletedFor: 'Rennen gelöscht:',
    raceDeletedSuccess: 'Rennen gelöscht:',
    confirmDeleteRace: 'Rennen löschen',
    confirmDeleteRaceText: 'Möchten Sie das Rennen wirklich löschen',
    loadError:
      'Fehler beim Laden der Rennen. Verbindung prüfen und erneut versuchen.',
    deleteError: 'Fehler beim Löschen des Rennens',
    entry: 'Eintrag',
    device: 'Gerät',

    // Storage errors
    storageError: 'Speichern fehlgeschlagen - Speicher prüfen',
    storageQuotaError: 'Speicher voll! Daten sofort exportieren',
    storageWarning: 'Speicher fast voll',
    storageNearlyFull:
      'Speicher fast voll. Daten exportieren und alte Einträge löschen.',

    // Network errors
    networkError: 'Netzwerkfehler - Verbindung prüfen',
    connectionFailed: 'Verbindung fehlgeschlagen',
    serverUnavailable: 'Server nicht erreichbar',
    rateLimitError: 'Zu viele Anfragen - bitte warten',
    authError: 'Authentifizierung fehlgeschlagen. PIN erneut eingeben.',

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

    // Wake Lock errors
    wakeLockFailed: 'Bildschirm kann während Zeitmessung abdunkeln',
    wakeLockIdleTimeout:
      'Bildschirm wird gedimmt um Akku zu sparen. Tippen zum Wachhalten.',

    // Generic errors
    unknownError: 'Unbekannter Fehler',

    // Onboarding
    onboardingWelcome: 'Willkommen bei CHRONO',
    onboardingWelcomeDesc: 'GPS-synchronisierte Zeitmessung für Skirennen',
    getStarted: "Los geht's",
    skipSetup: 'Überspringen',
    onboardingRole: 'Was ist deine Aufgabe?',
    onboardingRoleDesc: 'Wähle aus, wie du beim Rennen hilfst',
    roleTimerTitle: 'Zeitnehmer',
    roleTimerDesc: 'Du erfasst Start- und Zielzeiten',
    roleJudgeTitle: 'Torrichter',
    roleJudgeDesc: 'Du erfasst Torfehler',
    onboardingDeviceName: 'Timer benennen',
    onboardingDeviceNameDesc:
      'Dieser Name identifiziert dein Gerät beim Synchronisieren',
    onboardingDeviceNameJudge: 'Dein Name',
    onboardingDeviceNameJudgeDesc: 'Dies identifiziert dich als Torrichter',
    onboardingPhoto: 'Foto-Dokumentation',
    onboardingPhotoDesc:
      'Automatisch ein Foto bei jeder Zeiterfassung aufnehmen. Nützlich zur Überprüfung von Startnr. und bei Unstimmigkeiten.',
    enablePhotoCapture: 'Foto-Aufnahme aktivieren',
    photoCaptureLabel: 'Foto-Aufnahme',
    onboardingGates: 'Deine Tor-Zuweisung',
    onboardingGatesDesc:
      'Gib die Tornummern ein, die du beobachtest. Du kannst dies später ändern.',
    onboardingRaceSetup: 'Rennen beitreten',
    onboardingRaceSetupDesc:
      'Gib eine Rennen-ID ein um mit anderen Timern zu synchronisieren',
    skipForNow: 'Vorerst überspringen',
    onboardingReady: 'Bereit zur Zeitmessung!',
    onboardingReadyJudge: 'Bereit als Torrichter!',
    onboardingTip: 'Tippe auf den großen blauen Button um Zeiten zu erfassen',
    onboardingTipJudge: 'Tippe auf eine Startnr. um einen Fehler zu erfassen',
    startTiming: 'Zeitmessung starten',
    startJudging: 'Starten',
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
    invalidPin: 'PIN muss 4 Ziffern haben',
    recentRaces: 'Letzte Rennen',
    noRecentRaces: 'Keine Rennen von heute',
    errorOccurred: 'Ein Fehler ist aufgetreten',
    errorRecoveryMessage:
      'Die App hat einen Fehler festgestellt. Sie können diesen Hinweis schließen und fortfahren, oder die App neu laden.',
    dismiss: 'Schließen',
    reload: 'Neu laden',
    updateAvailable: 'Update verfügbar! Neu laden für die neueste Version.',
    operationFailed: 'Vorgang fehlgeschlagen. Bitte erneut versuchen.',
    raceIdPlaceholder: 'RENNEN-001',
    deviceNamePlaceholder: 'Timer 1',
    photoForBib: 'Foto für Startnr.',

    // Gate Judge (Torrichter)
    gateJudge: 'Torrichter',
    gateJudgeTab: 'Tor',
    deviceRole: 'Geräte-Rolle',
    deviceRoleDesc: 'Timer erfasst Zeiten, Torrichter erfasst Fehler',
    roleTimer: 'Zeitnehmer',
    roleGateJudge: 'Torrichter',
    gateAssignment: 'Tor-Zuweisung',
    noGateAssignment:
      'Keine Tor-Zuweisung. Bitte zuerst den Torbereich festlegen.',
    gates: 'Tore',
    gatesFrom: 'Von',
    gatesTo: 'Bis',
    firstGateColor: 'Farbe des ersten Tors',
    colorRed: 'Rot',
    colorBlue: 'Blau',
    changeGates: 'Ändern',
    otherJudges: 'Andere Torrichter:',
    activeBibs: 'Auf der Strecke',
    noBibsOnCourse: 'Keine Fahrer auf der Strecke',
    recordFault: 'Fehler erfassen',
    faultType: 'Fehlerart',
    faultMG: 'Tor ausgelassen',
    faultSTR: 'Einfädler',
    faultBR: 'Bindung offen',
    faultMGShort: 'TF',
    faultSTRShort: 'EF',
    faultBRShort: 'BO',
    orEnterManually: 'oder eingeben:',
    faultRecorded: 'Fehler erfasst',
    signalReady: 'Bereit',
    judgeReady: 'Bereit für Rennen!',
    judgeNotReady: 'Bereit-Status zurückgesetzt',
    faultDeleted: 'Fehler gelöscht',
    recordedFaults: 'Erfasste Fehler',
    selectBib: 'Startnr. wählen',
    selectGate: 'Tor',
    gate: 'Tor',
    noFaults: 'Keine Fehler erfasst',
    faultsFor: 'Fehler für',
    faultSummary: 'Fehler-Übersicht',
    penaltyTime: 'Strafzeit',
    faultCount: 'Fehler',
    markOk: 'OK markieren',
    saveFault: 'Fehler speichern',
    selectFaultType: 'Bitte Fehlerart wählen',
    gateOutOfRange: 'Tor liegt außerhalb des zugewiesenen Bereichs',
    flt: 'SZT',
    statusFlt: 'Strafzeit',

    // Chief Judge (Obmann)
    chiefJudge: 'Obmann',
    noFaultsRecorded: 'Keine Fehler erfasst',
    finalize: 'Bestätigen',
    finalized: 'Bestätigt',
    chiefJudgeMode: 'Obmann-Ansicht',
    chiefJudgeModeEnabled: 'Obmann-Ansicht aktiviert',
    chiefJudgeModeDisabled: 'Obmann-Ansicht deaktiviert',
    racersWithFaults: 'Fahrer mit Fehlern',
    penaltyMode: '+Zeit',
    gateJudges: 'Torrichter',
    noJudgesConnected: 'Keine Torrichter verbunden',
    summary: 'Übersicht',

    // Export
    exportCSV: 'CSV',
    exportWhatsApp: 'WhatsApp',
    noFaultsToExport: 'Keine Fehler zum Exportieren',
    copiedToClipboard: 'In Zwischenablage kopiert',
    gateJudgeCard: 'Torrichterkarte',
    race: 'Rennen',
    date: 'Datum',
    gateJudgeLabel: 'Torrichter',
    runLabel: 'Lauf',
    noFaultsEntered: 'Keine Fehler erfasst',
    signature: 'Unterschrift',
    legend: 'Legende',
    missedGateLegend: 'Ausgelassen',
    straddlingLegend: 'Einfädler',
    bindingLegend: 'Bindung',
    gateFaults: 'Torfehler',
    penaltyLabel: 'STRAFZEIT',
    faultSummaryTitle: 'ZUSAMMENFASSUNG TORFEHLER',
    faults: 'Fehler',
    penalty: 'Strafzeit',
    sec: 'Sek',
    generated: 'Erstellt',

    // Fault Edit & Version History
    editFault: 'Fehler bearbeiten',
    versionHistory: 'Versionshistorie',
    restoreVersion: 'Version wiederherstellen',
    currentVersion: 'Aktuell',
    originalVersion: 'Original',
    restored: 'Wiederhergestellt',
    versionRestored: 'Version wiederhergestellt',

    // Deletion Workflow
    markForDeletion: 'Zum Löschen markieren',
    markForDeletionText:
      'Dieser Fehler wird zum Löschen markiert und benötigt die Genehmigung des Obmanns für die endgültige Löschung.',
    markedForDeletion: 'Zum Löschen markiert',
    deletionPending: 'Löschung ausstehend',
    pendingDeletions: 'Ausstehende Löschungen',
    approveDeletion: 'Löschung genehmigen',
    rejectDeletion: 'Löschung ablehnen',
    deletionMarkedBy: 'Markiert von',
    deletionApproved: 'Löschung genehmigt',
    deletionRejected: 'Löschung abgelehnt',
    cannotEditPendingDeletion:
      'Fehler mit ausstehender Löschung kann nicht bearbeitet werden',

    // Voice Mode
    voiceMode: 'Sprachsteuerung',
    voiceModeDesc: 'Freihändige Sprachbefehle (Internet erforderlich)',
    voiceListening: 'Höre zu...',
    voiceProcessing: 'Verarbeite...',
    voiceConfirming: 'Bestätigen?',
    voiceOffline: 'Sprache offline nicht verfügbar',
    voiceNotSupported: 'Spracheingabe in diesem Browser nicht unterstützt',
    voicePermissionDenied: 'Mikrofonzugriff verweigert',
    voiceOK: 'OK',
    voiceRecorded: 'Erfasst',
    voiceNotUnderstood: 'Nicht verstanden',
    voiceCancelled: 'Abgebrochen',
    voiceError: 'Sprachfehler',
    voiceApiKeyRequired: 'API-Schlüssel für Sprachsteuerung erforderlich',

    // Localization - Pull to Refresh
    pullToRefresh: 'Zum Aktualisieren ziehen',
    releaseToRefresh: 'Loslassen zum Aktualisieren',

    // Localization - Sync Status
    synced: 'Synchronisiert',
    syncingStatus: 'Synchronisiere...',

    // Localization - Gate Assignment Modal
    gateAssignmentInstructions:
      'Gib den Torbereich ein, für den du verantwortlich bist:',

    // Localization - Ready Status
    readySuffix: ' - Bereit',

    // Localization - Aria Labels
    viewPhotoLabel: 'Foto anzeigen',
    editEntryLabel: 'Eintrag bearbeiten',
    deleteEntryLabel: 'Eintrag löschen',
    editFaultLabel: 'Fehler bearbeiten',
    deleteFaultLabel: 'Fehler löschen',
    deleteLabel: 'Löschen',
    gateNumberLabel: 'Tor',
    numberLabel: 'Zahl',
    currentTime: 'Aktuelle Uhrzeit',

    // Localization - PIN Verification
    pinVerifyOnline: 'PIN wird online überprüft',

    // Voice Notes
    addNote: 'Notiz hinzufügen',
    done: 'Fertig',
    recordNote: 'Notiz aufnehmen',
    listening: 'Höre zu...',
    noteSaved: 'Notiz gespeichert',
    noteDeleted: 'Notiz gelöscht',
    noteCharCount: 'Zeichen',
    voiceNoteUnsupported: 'Spracheingabe in diesem Browser nicht unterstützt',
    voiceNoteError: 'Spracheingabe-Fehler',
    typeNote: 'Notiz eintippen oder sprechen...',
    hasNote: 'Hat Notiz',
    noteTextLabel: 'Notiztext',
    recordVoiceNoteLabel: 'Sprachnotiz aufnehmen',

    // Indicator labels
    syncOnline: 'Sync online',
    syncOffline: 'Offline',
    syncShortConnected: 'Sync',
    syncShortSyncing: 'Sync...',
    syncShortError: 'Fehler',
    syncShortOff: 'Aus',
    syncDeviceAbbrev: 'G',

    // Auth
    sessionExpired: 'Sitzung abgelaufen. Bitte PIN erneut eingeben.',
    authSuccess: 'Authentifizierung erfolgreich',

    // Keyboard Shortcuts
    keyboardShortcuts: 'Tastenkürzel',
    keyboardShortcutsDesc: 'Alle Tastenkürzel anzeigen',
    shortcutSection_timer: 'Timer',
    shortcutSection_gateJudge: 'Torrichter',
    shortcutSection_results: 'Ergebnisse',
    shortcutSection_global: 'Allgemein',
    shortcut_enterDigit: 'Startnr.-Ziffer eingeben',
    shortcut_selectStart: 'Start wählen',
    shortcut_selectFinish: 'Ziel wählen',
    shortcut_selectRun1: 'Lauf 1 wählen',
    shortcut_selectRun2: 'Lauf 2 wählen',
    shortcut_recordTime: 'Zeitstempel erfassen',
    shortcut_clearBib: 'Startnr. löschen',
    shortcut_deleteLastDigit: 'Letzte Ziffer löschen',
    shortcut_missedGate: 'Tor ausgelassen',
    shortcut_straddled: 'Einfädler',
    shortcut_broken: 'Bindung offen',
    shortcut_selectGate: 'Tor wählen',
    shortcut_navigateBtns: 'Buttons navigieren',
    shortcut_confirmSelection: 'Auswahl bestätigen',
    shortcut_navigateItems: 'Einträge navigieren',
    shortcut_editItem: 'Eintrag bearbeiten',
    shortcut_deleteItem: 'Eintrag löschen',
    shortcut_moveTab: 'Zwischen Tabs wechseln',
    shortcut_closeModal: 'Dialog schließen',
    shortcut_navigateInComponent: 'In Komponente navigieren',
    shortcut_showShortcuts: 'Tastenkürzel anzeigen',

    // Offline/online banner
    offlineBanner: 'Offline. Zeiten werden lokal gespeichert.',
    onlineRestored: 'Wieder online',

    // Undo toast
    entryDeleted: 'Eintrag gelöscht',
    undoAction: 'Rückgängig',

    // Multi-device duplicates
    multiDeviceDuplicate: 'Mehrere Geräte',
    duplicateDevices: '{count} Geräte',
    duplicateCount: '{count} Duplikate',
  },

  fr: {
    // Navigation
    timer: 'Chrono',
    results: 'Résultats',
    settings: 'Paramètres',

    // Timer View
    start: 'Départ',
    finish: 'Arrivée',
    startShort: 'D',
    finishShort: 'A',
    bib: 'Dossard',
    point: 'Point',
    run: 'Manche',
    run1: 'M1',
    run2: 'M2',
    runLabel1: 'Manche 1',
    runLabel2: 'Manche 2',
    time: 'Enregistrer le temps',
    lastRecorded: 'Dernier enregistré',
    lastRecordedShort: 'Dernier :',
    advancedSettings: 'Paramètres avancés',

    // Results View
    status: 'Statut',
    noEntries: 'Aucune entrée enregistrée',
    noEntriesHint: "Enregistrez des temps dans l'onglet Chrono",
    search: 'Rechercher par dossard...',
    searchResults: 'Résultats de recherche',
    filter: 'Filtrer',
    all: 'Tous',
    total: 'Total',
    racers: 'Coureurs',
    finished: "À l'arrivée",
    entriesRecorded: 'entrées enregistrées',
    fastest: 'Plus rapide',
    average: 'Moyenne',
    timeEntry: 'temps',
    timeEntries: 'temps',
    faultEntry: 'faute',
    faultEntries: 'fautes',

    // Status
    ok: 'OK',
    dns: 'DNS',
    dnf: 'DNF',
    dsq: 'DSQ',

    // Actions
    confirmDelete: "Supprimer l'entrée",
    confirmDeleteText: 'Voulez-vous vraiment supprimer cette entrée ?',
    confirmDeleteFault: 'Supprimer cette faute ?',
    confirmClearAll: 'Tout effacer',
    clearAllText:
      'Toutes les entrées seront supprimées. Cette action est irréversible.',
    confirmUndoAdd: "Annuler l'enregistrement",
    confirmUndoAddText: "L'entrée enregistrée sera supprimée. Continuer ?",
    delete: 'Supprimer',
    cancel: 'Annuler',
    close: 'Fermer',
    back: 'Retour',
    save: 'Enregistrer',
    saving: 'Enregistrement...',
    edit: 'Modifier',
    undo: 'Annuler',
    export: 'Exporter',
    clearAll: 'Tout effacer',
    selectAll: 'Tout sélectionner',
    deleteSelected: 'Supprimer la sélection',

    // Sync
    connected: 'Sync',
    connecting: '...',
    syncing: 'Sync',
    offline: 'X',
    syncError: '!',
    syncReceived: 'Synchronisé depuis le cloud',
    raceId: 'ID de course',
    invalidRaceId:
      'ID de course invalide. Utilisez uniquement lettres, chiffres, tirets et underscores.',
    deviceName: 'ID du chronométreur',
    cloudSync: 'Sync cloud',
    syncStatus: 'État de la sync',
    pendingSync: 'sync en attente',
    raceSetup: 'Configuration de course',
    raceSetupDesc:
      'Requis pour le chronométrage multi-appareils et la synchronisation.',
    firstGateLabel: 'Première porte',

    // Feedback
    saved: 'Enregistré',
    deleted: 'Supprimé',
    cleared: 'Toutes les entrées effacées',
    undone: 'Annulé',
    copied: 'Copié dans le presse-papiers',
    debugInfoCopied: 'Infos de débogage copiées dans le presse-papiers',
    debugInfoCopyFailed: 'Appuyez longuement pour copier les infos de débogage',
    duplicateWarning: 'Doublon détecté',
    zeroBibWarning: "Dossard 000 - vérifiez l'entrée",
    exported: 'Exporté avec succès',

    // GPS
    gps: 'GPS',
    gpsActive: 'GPS actif',
    gpsSearching: 'Recherche GPS...',
    gpsInactive: 'GPS inactif',
    gpsAccuracy: 'Précision',

    // Settings groups
    settingsRaceSetup: 'Configuration de course',
    settingsTimingGroup: 'Chronométrage',
    settingsSyncGroup: 'Synchronisation',
    settingsFeedbackGroup: 'Retour',
    settingsDisplayGroup: 'Affichage',

    // Settings
    simpleMode: 'Mode simplifié',
    fullMode: 'Mode complet',
    autoIncrement: 'Dossard auto-incrémenté',
    hapticFeedback: 'Retour haptique',
    soundFeedback: 'Retour sonore',
    language: 'Langue',
    advancedSettingsHint:
      'Ces options peuvent affecter la précision du chronométrage. Modifier uniquement si nécessaire.',

    // Settings descriptions
    simpleModeDesc: 'Interface simplifiée pour un chronométrage basique',
    cloudSyncDesc: "Synchroniser avec d'autres appareils",
    gpsDesc: 'Utiliser le GPS pour des horodatages précis',
    autoIncrementDesc: "Augmenter le numéro de dossard après l'enregistrement",
    photoCaptureDesc: "Capturer une photo à l'enregistrement du temps",
    hapticFeedbackDesc: 'Vibration lors des actions',
    soundFeedbackDesc: 'Confirmation sonore',
    ambientMode: 'Mode veille',
    ambientModeDesc: "Atténuer après 30s d'inactivité",

    // Photo
    photoCapture: 'Capture photo',
    photoCaptured: 'Photo capturée',
    photoError: 'Échec de la capture photo',
    photoSaveFailed: 'Échec de la sauvegarde photo',
    viewPhoto: 'Voir la photo',
    deletePhoto: 'Supprimer la photo',
    photoFor: 'Photo pour dossard',
    noPhotoAvailable: 'Aucune photo disponible',
    photoDeleted: 'Photo supprimée',

    // Race Change
    raceChangeTitle: 'Changer de course',
    raceChangeSyncedText:
      "Vous avez des résultats d'une autre course. Les exporter ou les supprimer avant de changer ?",
    raceChangeUnsyncedText:
      'Vous avez des résultats existants. Les garder ou les supprimer avant de changer ?',
    keepResults: 'Garder',

    // Misc
    version: 'Version',
    devices: 'Appareils',
    entries: 'entrées',
    selected: 'sélectionné(s)',

    // Race exists indicator
    raceFound: 'Course trouvée',
    raceNew: 'Nouvelle course',
    entryInCloud: 'entrée dans le cloud',
    entriesInCloud: 'entrées dans le cloud',

    // Photo sync
    photoTooLarge: 'Photo trop volumineuse pour la sync',
    syncedEntriesFromCloud: '{count} entrées synchronisées depuis le cloud',
    syncedFaultsFromCloud: '{count} fautes synchronisées depuis le cloud',
    crossDeviceDuplicate:
      'Doublon : Dossard {bib} {point} déjà enregistré par {device}',

    // Photo sync settings
    syncPhotos: 'Synchroniser les photos',
    syncPhotosDesc: 'Partager les photos entre appareils via le cloud',
    syncPhotosWarning: 'Activer la sync des photos',
    syncPhotosWarningText:
      "L'activation de la synchronisation des photos transférera les données suivantes :",
    photosToUpload: 'Photos à envoyer',
    photosToDownload: 'Photos à télécharger',
    totalDataVolume: 'Volume total de données',
    enableSync: 'Activer la sync',
    noPhotosToSync: 'Aucune photo à synchroniser',

    // Race Management
    admin: 'Admin',
    adminPin: 'PIN de gestion des courses',
    adminPinDesc: 'Requis pour gérer et synchroniser les courses',
    manageRaces: 'Gérer les courses',
    manageRacesDesc: 'Afficher et supprimer les courses synchronisées',
    manage: 'Gérer',
    enterAdminPin: 'Entrez le PIN de gestion des courses',
    enterPinText: 'Entrez votre PIN pour accéder à la gestion des courses.',
    enterPinToJoinRace: 'Entrez votre PIN pour rejoindre cette course.',
    enterPinForChiefJudge:
      'Entrez votre PIN pour accéder au mode Directeur de course.',
    enterChiefJudgePin: 'Entrez le PIN Directeur de course',
    enterPinForChiefJudgeInfo:
      'Le mode Directeur de course nécessite un PIN séparé. La première saisie définit le PIN.',
    syncRequiresPin:
      'Sync désactivée. Activez la sync et entrez le PIN pour vous reconnecter.',
    incorrectPin: 'PIN incorrect',
    verify: 'Vérifier',
    setPinFirst: "Veuillez d'abord définir un PIN de gestion des courses",
    pinSaved: 'PIN enregistré',
    pinCleared: 'PIN effacé',
    pinNotSet: 'Non défini',
    pinSet: 'PIN défini',
    setPin: 'Définir le PIN',
    changePin: 'Changer le PIN',
    currentPin: 'PIN actuel',
    newPin: 'Nouveau PIN (4 chiffres)',
    confirmPin: 'Confirmer le PIN',
    pinMismatch: 'Les PIN ne correspondent pas',
    pinFormatError: 'Le PIN doit comporter exactement 4 chiffres',
    loading: 'Chargement...',
    noRaces: 'Aucune course active',
    noRacesHint: 'Créez-en une dans les Paramètres',
    cleanRunHint: "Manche sans faute jusqu'ici",
    refresh: 'Actualiser',
    raceDeleted: 'Course supprimée',
    raceDeletedText: 'Cette course a été supprimée par un administrateur.',
    raceDeletedFor: 'Course supprimée :',
    raceDeletedSuccess: 'Course supprimée :',
    confirmDeleteRace: 'Supprimer la course',
    confirmDeleteRaceText: 'Voulez-vous vraiment supprimer la course',
    loadError:
      'Échec du chargement des courses. Vérifiez votre connexion et réessayez.',
    deleteError: 'Échec de la suppression de la course',
    entry: 'entrée',
    device: 'appareil',

    // Storage errors
    storageError: 'Échec de la sauvegarde - vérifiez le stockage',
    storageQuotaError: 'Stockage plein ! Exportez les données immédiatement',
    storageWarning: 'Stockage presque plein',
    storageNearlyFull:
      'Stockage presque plein. Exportez les données et supprimez les anciennes entrées.',

    // Network errors
    networkError: 'Erreur réseau - vérifiez la connexion',
    connectionFailed: 'Connexion échouée',
    serverUnavailable: 'Serveur indisponible',
    rateLimitError: 'Trop de requêtes - veuillez patienter',
    authError: 'Authentification échouée. Veuillez ressaisir votre PIN.',

    // Sync errors
    syncFailed: 'Synchronisation échouée',
    pinSyncFailed: 'PIN non synchronisé avec le cloud',

    // Camera errors
    cameraError: 'Erreur caméra',
    cameraPermissionDenied: 'Accès à la caméra refusé',

    // GPS errors
    gpsError: 'Erreur GPS',
    gpsPermissionDenied: 'Accès GPS refusé',
    gpsUnavailable: 'GPS indisponible',

    // Wake Lock errors
    wakeLockFailed: "L'écran peut s'éteindre pendant le chronométrage",
    wakeLockIdleTimeout:
      "L'écran va s'atténuer pour économiser la batterie. Touchez pour maintenir l'écran actif.",

    // Generic errors
    unknownError: 'Erreur inconnue',

    // Onboarding
    onboardingWelcome: 'Bienvenue sur CHRONO',
    onboardingWelcomeDesc:
      'Chronométrage synchronisé par GPS pour les courses de ski',
    getStarted: "C'est parti",
    skipSetup: 'Passer',
    onboardingRole: 'Quel est votre rôle ?',
    onboardingRoleDesc: 'Choisissez comment vous aiderez à la course',
    roleTimerTitle: 'Chronométreur',
    roleTimerDesc: "Vous enregistrerez les temps de départ et d'arrivée",
    roleJudgeTitle: 'Juge de porte',
    roleJudgeDesc: 'Vous enregistrerez les fautes de porte',
    onboardingDeviceName: 'Nommez votre chronomètre',
    onboardingDeviceNameDesc:
      'Ce nom identifie votre appareil lors de la synchronisation',
    onboardingDeviceNameJudge: 'Votre nom',
    onboardingDeviceNameJudgeDesc:
      'Ceci vous identifie en tant que juge de porte',
    onboardingPhoto: 'Documentation photo',
    onboardingPhotoDesc:
      'Capturer automatiquement une photo à chaque enregistrement de temps. Utile pour vérifier les numéros de dossard et résoudre les litiges.',
    enablePhotoCapture: 'Activer la capture photo',
    photoCaptureLabel: 'Capture photo',
    onboardingGates: 'Votre affectation de portes',
    onboardingGatesDesc:
      'Entrez les numéros de portes que vous surveillerez. Vous pourrez les modifier plus tard.',
    onboardingRaceSetup: 'Rejoindre une course',
    onboardingRaceSetupDesc:
      "Entrez un ID de course pour synchroniser avec d'autres chronométreurs",
    skipForNow: 'Passer pour le moment',
    onboardingReady: 'Prêt à chronométrer !',
    onboardingReadyJudge: 'Prêt à juger !',
    onboardingTip:
      'Appuyez sur le grand bouton bleu pour enregistrer les temps',
    onboardingTipJudge:
      "Appuyez sur le dossard d'un coureur pour enregistrer une faute",
    startTiming: 'Démarrer le chronométrage',
    startJudging: 'Commencer à juger',
    continue: 'Continuer',
    deviceNameLabel: "Nom de l'appareil",
    raceIdLabel: 'ID de course',
    syncStatusLabel: 'Sync cloud',
    enabled: 'Activé',
    disabled: 'Désactivé',
    showTutorial: 'Afficher le tutoriel',
    showTutorialDesc: "Relancer l'assistant de configuration",
    show: 'Afficher',
    onboardingComplete: 'Configuration terminée !',
    invalidPin: 'Le PIN doit comporter 4 chiffres',
    recentRaces: 'Courses récentes',
    noRecentRaces: "Aucune course aujourd'hui",
    errorOccurred: "Une erreur s'est produite",
    errorRecoveryMessage:
      "L'application a rencontré une erreur. Vous pouvez ignorer cet avis et continuer, ou recharger l'application.",
    dismiss: 'Ignorer',
    reload: 'Recharger',
    updateAvailable:
      'Mise à jour disponible ! Rechargez pour obtenir la dernière version.',
    operationFailed: 'Opération échouée. Veuillez réessayer.',
    raceIdPlaceholder: 'COURSE-001',
    deviceNamePlaceholder: 'Chrono 1',
    photoForBib: 'Photo pour dossard',

    // Gate Judge (Juge de porte)
    gateJudge: 'Juge de porte',
    gateJudgeTab: 'Porte',
    deviceRole: "Rôle de l'appareil",
    deviceRoleDesc:
      'Le chronométreur enregistre les temps, le juge de porte enregistre les fautes',
    roleTimer: 'Chronométreur',
    roleGateJudge: 'Juge de porte',
    gateAssignment: 'Affectation de portes',
    noGateAssignment:
      "Aucune affectation de portes. Veuillez d'abord définir votre zone de portes.",
    gates: 'Portes',
    gatesFrom: 'De',
    gatesTo: 'À',
    firstGateColor: 'Couleur de la première porte',
    colorRed: 'Rouge',
    colorBlue: 'Bleu',
    changeGates: 'Modifier',
    otherJudges: 'Autres juges :',
    activeBibs: 'Sur la piste',
    noBibsOnCourse: 'Aucun coureur sur la piste',
    recordFault: 'Enregistrer une faute',
    faultType: 'Type de faute',
    faultMG: 'Porte manquée',
    faultSTR: 'Enfourché',
    faultBR: 'Fixation ouverte',
    faultMGShort: 'PM',
    faultSTRShort: 'ENF',
    faultBRShort: 'FO',
    orEnterManually: 'ou saisir :',
    faultRecorded: 'Faute enregistrée',
    signalReady: 'Prêt',
    judgeReady: 'Prêt pour la course !',
    judgeNotReady: 'Statut prêt effacé',
    faultDeleted: 'Faute supprimée',
    recordedFaults: 'Fautes enregistrées',
    selectBib: 'Sélectionner le dossard',
    selectGate: 'Porte',
    gate: 'Porte',
    noFaults: 'Aucune faute enregistrée',
    faultsFor: 'Fautes pour',
    faultSummary: 'Résumé des fautes',
    penaltyTime: 'Pénalité',
    faultCount: 'fautes',
    markOk: 'Marquer OK',
    saveFault: 'Enregistrer la faute',
    selectFaultType: 'Veuillez sélectionner un type de faute',
    gateOutOfRange: 'La porte est en dehors de la zone assignée',
    flt: 'PEN',
    statusFlt: 'Pénalité de faute',

    // Chief Judge (Directeur de course)
    chiefJudge: 'Directeur de course',
    noFaultsRecorded: 'Aucune faute enregistrée',
    finalize: 'Valider',
    finalized: 'Validé',
    chiefJudgeMode: 'Mode Directeur de course',
    chiefJudgeModeEnabled: 'Mode Directeur de course activé',
    chiefJudgeModeDisabled: 'Mode Directeur de course désactivé',
    racersWithFaults: 'Coureurs avec fautes',
    penaltyMode: '+Temps',
    gateJudges: 'Juges de porte',
    noJudgesConnected: 'Aucun juge de porte connecté',
    summary: 'Résumé',

    // Export
    exportCSV: 'CSV',
    exportWhatsApp: 'WhatsApp',
    noFaultsToExport: 'Aucune faute à exporter',
    copiedToClipboard: 'Copié dans le presse-papiers',
    gateJudgeCard: 'Carte de juge de porte',
    race: 'Course',
    date: 'Date',
    gateJudgeLabel: 'Juge de porte',
    runLabel: 'Manche',
    noFaultsEntered: 'Aucune faute enregistrée',
    signature: 'Signature',
    legend: 'Légende',
    missedGateLegend: 'Manquée',
    straddlingLegend: 'Enfourché',
    bindingLegend: 'Fixation',
    gateFaults: 'Fautes de porte',
    penaltyLabel: 'PÉNALITÉ',
    faultSummaryTitle: 'RÉSUMÉ DES FAUTES DE PORTE',
    faults: 'Fautes',
    penalty: 'Pénalité',
    sec: 'sec',
    generated: 'Généré',

    // Fault Edit & Version History
    editFault: 'Modifier la faute',
    versionHistory: 'Historique des versions',
    restoreVersion: 'Restaurer la version sélectionnée',
    currentVersion: 'Actuelle',
    originalVersion: 'Originale',
    restored: 'Restaurée',
    versionRestored: 'Version restaurée',

    // Deletion Workflow
    markForDeletion: 'Marquer pour suppression',
    markForDeletionText:
      "Cette faute sera marquée pour suppression et nécessite l'approbation du Directeur de course pour être définitivement supprimée.",
    markedForDeletion: 'Marquée pour suppression',
    deletionPending: 'Suppression en attente',
    pendingDeletions: 'Suppressions en attente',
    approveDeletion: 'Approuver la suppression',
    rejectDeletion: 'Rejeter la suppression',
    deletionMarkedBy: 'Marquée par',
    deletionApproved: 'Suppression approuvée',
    deletionRejected: 'Suppression rejetée',
    cannotEditPendingDeletion:
      'Impossible de modifier une faute en attente de suppression',

    // Voice Mode
    voiceMode: 'Mode vocal',
    voiceModeDesc: 'Commandes vocales mains libres (Internet requis)',
    voiceListening: 'Écoute...',
    voiceProcessing: 'Traitement...',
    voiceConfirming: 'Confirmer ?',
    voiceOffline: 'Voix indisponible hors ligne',
    voiceNotSupported: 'Voix non supportée dans ce navigateur',
    voicePermissionDenied: 'Accès au microphone refusé',
    voiceOK: 'OK',
    voiceRecorded: 'Enregistré',
    voiceNotUnderstood: 'Non compris',
    voiceCancelled: 'Annulé',
    voiceError: 'Erreur vocale',
    voiceApiKeyRequired: 'Clé API requise pour le mode vocal',

    // Localization - Pull to Refresh
    pullToRefresh: 'Tirez pour actualiser',
    releaseToRefresh: 'Relâchez pour actualiser',

    // Localization - Sync Status
    synced: 'Synchronisé',
    syncingStatus: 'Synchronisation...',

    // Localization - Gate Assignment Modal
    gateAssignmentInstructions:
      'Entrez la zone de portes dont vous êtes responsable :',

    // Localization - Ready Status
    readySuffix: ' - Prêt',

    // Localization - Aria Labels
    viewPhotoLabel: 'Voir la photo',
    editEntryLabel: "Modifier l'entrée",
    deleteEntryLabel: "Supprimer l'entrée",
    editFaultLabel: 'Modifier la faute',
    deleteFaultLabel: 'Supprimer la faute',
    deleteLabel: 'Supprimer',
    gateNumberLabel: 'Porte',
    numberLabel: 'Numéro',
    currentTime: 'Heure actuelle',

    // Localization - PIN Verification
    pinVerifyOnline: 'Le PIN sera vérifié une fois en ligne',

    // Voice Notes
    addNote: 'Ajouter une note',
    done: 'Terminé',
    recordNote: 'Enregistrer une note',
    listening: 'Écoute...',
    noteSaved: 'Note enregistrée',
    noteDeleted: 'Note supprimée',
    noteCharCount: 'caractères',
    voiceNoteUnsupported: 'Saisie vocale non supportée dans ce navigateur',
    voiceNoteError: 'Erreur de saisie vocale',
    typeNote: 'Tapez ou dictez votre note...',
    hasNote: 'A une note',
    noteTextLabel: 'Texte de la note',
    recordVoiceNoteLabel: 'Enregistrer une note vocale',

    // Indicator labels
    syncOnline: 'Sync en ligne',
    syncOffline: 'Hors ligne',
    syncShortConnected: 'Sync',
    syncShortSyncing: 'Sync...',
    syncShortError: 'Erreur',
    syncShortOff: 'Off',
    syncDeviceAbbrev: 'app',

    // Auth
    sessionExpired: 'Session expirée. Veuillez ressaisir votre PIN.',
    authSuccess: 'Authentification réussie',

    // Keyboard Shortcuts
    keyboardShortcuts: 'Raccourcis clavier',
    keyboardShortcutsDesc: 'Afficher tous les raccourcis clavier',
    shortcutSection_timer: 'Chrono',
    shortcutSection_gateJudge: 'Juge de porte',
    shortcutSection_results: 'Résultats',
    shortcutSection_global: 'Général',
    shortcut_enterDigit: 'Entrer un chiffre de dossard',
    shortcut_selectStart: 'Sélectionner Départ',
    shortcut_selectFinish: 'Sélectionner Arrivée',
    shortcut_selectRun1: 'Sélectionner Manche 1',
    shortcut_selectRun2: 'Sélectionner Manche 2',
    shortcut_recordTime: 'Enregistrer le temps',
    shortcut_clearBib: 'Effacer le dossard',
    shortcut_deleteLastDigit: 'Supprimer le dernier chiffre',
    shortcut_missedGate: 'Porte manquée',
    shortcut_straddled: 'Enfourché',
    shortcut_broken: 'Fixation ouverte',
    shortcut_selectGate: 'Sélectionner la porte',
    shortcut_navigateBtns: 'Naviguer entre les boutons',
    shortcut_confirmSelection: 'Confirmer la sélection',
    shortcut_navigateItems: 'Naviguer entre les éléments',
    shortcut_editItem: "Modifier l'élément",
    shortcut_deleteItem: "Supprimer l'élément",
    shortcut_moveTab: "Changer d'onglet",
    shortcut_closeModal: 'Fermer la modale',
    shortcut_navigateInComponent: 'Naviguer dans le composant',
    shortcut_showShortcuts: 'Afficher les raccourcis',

    // Offline/online banner
    offlineBanner:
      'Vous êtes hors ligne. Les temps seront sauvegardés localement.',
    onlineRestored: 'De retour en ligne',

    // Undo toast
    entryDeleted: 'Entrée supprimée',
    undoAction: 'Annuler',

    // Multi-device duplicates
    multiDeviceDuplicate: 'Multi-appareils',
    duplicateDevices: '{count} appareils',
    duplicateCount: '{count} doublons',
  },
} satisfies Record<Language, Translations>;

// ===== Compile-time Translation Key Safety =====
// These assertions ensure EN, DE, and FR translations stay in sync.
// If a key is added to one language but not another, TypeScript will error.

/** All translation keys derived from the English translations */
export type TranslationKey = keyof typeof translations.en;

// Verify DE has all EN keys
type _MissingInDe = Exclude<
  keyof typeof translations.en,
  keyof typeof translations.de
>;
type _MissingInEn = Exclude<
  keyof typeof translations.de,
  keyof typeof translations.en
>;

// Verify FR has all EN keys (and vice versa)
type _MissingInFr = Exclude<
  keyof typeof translations.en,
  keyof typeof translations.fr
>;
type _MissingInEnFromFr = Exclude<
  keyof typeof translations.fr,
  keyof typeof translations.en
>;

// These lines cause compile errors if any keys are missing between languages.
// The error message will show which specific keys are missing.
const _assertDeComplete: _MissingInDe extends never ? true : _MissingInDe =
  true;
const _assertEnComplete: _MissingInEn extends never ? true : _MissingInEn =
  true;
const _assertFrComplete: _MissingInFr extends never ? true : _MissingInFr =
  true;
const _assertEnFromFrComplete: _MissingInEnFromFr extends never
  ? true
  : _MissingInEnFromFr = true;

// Suppress unused variable warnings
void _assertDeComplete;
void _assertEnComplete;
void _assertFrComplete;
void _assertEnFromFrComplete;

/**
 * Get translation for a key
 * Accepts TranslationKey for type-safe usage or string for dynamic keys
 */
export function t(
  key: TranslationKey | (string & {}),
  lang: Language = 'de',
): string {
  const langMap = translations[lang] as Record<string, string>;
  const enMap = translations.en as Record<string, string>;
  return langMap[key] || enMap[key] || key;
}
