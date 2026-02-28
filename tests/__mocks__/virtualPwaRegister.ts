// Shim for virtual:pwa-register (provided by vite-plugin-pwa at build time)
export function registerSW(_options?: {
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
}) {
  return () => {};
}
