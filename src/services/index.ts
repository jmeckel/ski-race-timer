// Re-export all services
export { cameraService, captureTimingPhoto } from './camera';
export { syncService, syncEntry } from './sync';
export { gpsService } from './gps';
export { photoStorage } from './photoStorage';
export { wakeLockService } from './wakeLock';
export { batteryService, type BatteryLevel } from './battery';
export { ambientModeService, type AmbientTrigger } from './ambient';
// DISABLED: Motion effects disabled to save battery
// export { motionService } from './motion';
export * from './feedback';

// Voice mode services
export { voiceModeService } from './voice';
export { speechSynthesis } from './speechSynthesis';
export { processVoiceCommandWithTimeout } from './llmProvider';
