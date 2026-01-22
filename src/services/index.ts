// Re-export all services
export { cameraService, captureTimingPhoto } from './camera';
export { syncService, syncEntry } from './sync';
export { gpsService } from './gps';
export { autoFinishTimingService, type AutoFinishStatus, type AutoFinishConfig } from './autoFinishTiming';
export { photoStorage } from './photoStorage';
export { wakeLockService } from './wakeLock';
export { batteryService, type BatteryLevel } from './battery';
// DISABLED: Motion effects disabled to save battery
// export { motionService } from './motion';
export * from './feedback';
