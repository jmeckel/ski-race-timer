import { cameraService } from './camera';

export type AutoFinishStatus = 'idle' | 'armed' | 'paused' | 'triggered';

export interface AutoFinishConfig {
  linePosition: number; // 0-1
  gateWidth: number; // 0-1
  sensitivity: number; // 0-1
}

type TriggerCallback = (timestamp: string) => void;
type StatusCallback = (status: AutoFinishStatus, detail?: string) => void;

const DEFAULT_CONFIG: AutoFinishConfig = {
  linePosition: 0.5,
  gateWidth: 0.2,
  sensitivity: 0.6
};

const PROCESS_FPS = 18;
const TRIGGER_COOLDOWN_MS = 800;
const DIRECTION_WINDOW_MS = 400;

class AutoFinishTimingService {
  private running = false;
  private videoElement: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null = null;
  private lastFrame: Uint8ClampedArray | null = null;
  private lastProcessTime = 0;
  private lastTriggerAt = 0;
  private pendingDirection: 'lr' | 'rl' | null = null;
  private pendingAt = 0;
  private config: AutoFinishConfig = { ...DEFAULT_CONFIG };
  private triggerCallback: TriggerCallback | null = null;
  private statusCallback: StatusCallback | null = null;
  private status: AutoFinishStatus = 'idle';

  constructor() {
    this.canvas = document.createElement('canvas');
  }

  attachVideoElement(element: HTMLVideoElement | null): void {
    this.videoElement = element;
    if (element) {
      cameraService.setPreviewElement(element);
    }
  }

  start(config: AutoFinishConfig, onTrigger: TriggerCallback, onStatus?: StatusCallback): void {
    if (this.running) {
      this.updateConfig(config);
      return;
    }

    if (!this.videoElement) {
      this.setStatus('paused', 'Missing video element');
      return;
    }

    this.running = true;
    this.triggerCallback = onTrigger;
    this.statusCallback = onStatus || null;
    this.updateConfig(config);
    this.lastFrame = null;
    this.pendingDirection = null;
    this.pendingAt = 0;
    this.lastProcessTime = 0;
    this.setStatus('armed');

    cameraService.initialize().then(() => {
      this.loop();
    }).catch(() => {
      this.setStatus('paused', 'Camera unavailable');
    });
  }

  stop(): void {
    this.running = false;
    this.lastFrame = null;
    this.pendingDirection = null;
    this.pendingAt = 0;
    this.triggerCallback = null;
    this.setStatus('idle');
  }

  updateConfig(config: AutoFinishConfig): void {
    this.config = {
      linePosition: Math.min(0.9, Math.max(0.1, config.linePosition)),
      gateWidth: Math.min(0.4, Math.max(0.08, config.gateWidth)),
      sensitivity: Math.min(0.9, Math.max(0.2, config.sensitivity))
    };
  }

  getConfig(): AutoFinishConfig {
    return { ...this.config };
  }

  private setStatus(status: AutoFinishStatus, detail?: string): void {
    this.status = status;
    if (this.statusCallback) {
      this.statusCallback(status, detail);
    }
  }

  private loop(): void {
    if (!this.running) return;
    requestAnimationFrame((timestamp) => {
      if (!this.running) return;
      const interval = 1000 / PROCESS_FPS;
      if (timestamp - this.lastProcessTime >= interval) {
        this.lastProcessTime = timestamp;
        this.processFrame();
      }
      this.loop();
    });
  }

  private processFrame(): void {
    const video = this.videoElement;
    if (!video || video.readyState < 2) {
      this.setStatus('paused', 'Waiting for camera');
      return;
    }

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    if (!width || !height) return;

    const gateWidthPx = Math.round(width * this.config.gateWidth);
    const lineX = Math.round(width * this.config.linePosition);
    const left = Math.max(0, lineX - Math.floor(gateWidthPx / 2));
    const right = Math.min(width, left + gateWidthPx);
    const roiWidth = right - left;

    const targetWidth = 160;
    const targetHeight = Math.round((height / width) * targetWidth);

    this.canvas.width = targetWidth;
    this.canvas.height = targetHeight;
    this.ctx = this.ctx || this.canvas.getContext('2d', { willReadFrequently: true });
    if (!this.ctx) return;

    this.ctx.drawImage(video, left, 0, roiWidth, height, 0, 0, targetWidth, targetHeight);
    const frame = this.ctx.getImageData(0, 0, targetWidth, targetHeight);

    if (!this.lastFrame) {
      this.lastFrame = frame.data.slice();
      this.setStatus('armed');
      return;
    }

    const pixelCount = targetWidth * targetHeight;
    let totalDiff = 0;
    let leftDiff = 0;
    let rightDiff = 0;
    const midX = Math.floor(targetWidth / 2);

    for (let y = 0; y < targetHeight; y++) {
      for (let x = 0; x < targetWidth; x++) {
        const idx = (y * targetWidth + x) * 4;
        const r = frame.data[idx];
        const g = frame.data[idx + 1];
        const b = frame.data[idx + 2];
        const lastR = this.lastFrame[idx];
        const lastG = this.lastFrame[idx + 1];
        const lastB = this.lastFrame[idx + 2];
        const diff = Math.abs(r - lastR) + Math.abs(g - lastG) + Math.abs(b - lastB);
        totalDiff += diff;
        if (x < midX) {
          leftDiff += diff;
        } else {
          rightDiff += diff;
        }
      }
    }

    this.lastFrame = frame.data.slice();

    const avgTotal = totalDiff / (pixelCount * 3);
    const avgLeft = leftDiff / ((pixelCount / 2) * 3);
    const avgRight = rightDiff / ((pixelCount / 2) * 3);

    const threshold = this.getThreshold();
    const strongThreshold = threshold * 2.2;
    const now = performance.now();

    if (now - this.lastTriggerAt < TRIGGER_COOLDOWN_MS) {
      return;
    }

    if (avgTotal > strongThreshold) {
      this.trigger(now);
      return;
    }

    if (avgLeft > threshold && avgLeft > avgRight * 1.2) {
      this.pendingDirection = 'lr';
      this.pendingAt = now;
    } else if (avgRight > threshold && avgRight > avgLeft * 1.2) {
      this.pendingDirection = 'rl';
      this.pendingAt = now;
    }

    if (this.pendingDirection && now - this.pendingAt <= DIRECTION_WINDOW_MS) {
      if (this.pendingDirection === 'lr' && avgRight > threshold) {
        this.trigger(now);
      } else if (this.pendingDirection === 'rl' && avgLeft > threshold) {
        this.trigger(now);
      }
    } else if (this.pendingDirection && now - this.pendingAt > DIRECTION_WINDOW_MS) {
      this.pendingDirection = null;
    }
  }

  private getThreshold(): number {
    const base = 8;
    const range = 5;
    return base - (this.config.sensitivity * range);
  }

  private trigger(now: number): void {
    this.lastTriggerAt = now;
    this.pendingDirection = null;
    this.pendingAt = 0;
    this.setStatus('triggered');
    if (this.triggerCallback) {
      this.triggerCallback(new Date().toISOString());
    }
    setTimeout(() => {
      if (this.running) {
        this.setStatus('armed');
      }
    }, 300);
  }
}

export const autoFinishTimingService = new AutoFinishTimingService();
