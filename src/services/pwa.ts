import { isTauriDesktop } from './nativeTreeRepository';

export async function initializePwa(): Promise<void> {
  if (isTauriDesktop()) {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations
        .filter((registration) => [registration.active, registration.waiting, registration.installing]
          .some((worker) => worker && new URL(worker.scriptURL).pathname === '/sw.js'))
        .map((registration) => registration.unregister()));
    }
    return;
  }
  const manifest = document.createElement('link');
  manifest.rel = 'manifest';
  manifest.href = '/manifest.json';
  document.head.appendChild(manifest);
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.register('/sw.js');
    await registration.update();
  }
}
