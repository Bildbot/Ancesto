import { isTauriDesktop } from './nativeTreeRepository';

const BASE_URL = import.meta.env.BASE_URL;
const serviceWorkerUrl = `${BASE_URL}sw.js`;

export async function initializePwa(): Promise<void> {
  if (isTauriDesktop()) {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const expectedScriptPath = new URL(serviceWorkerUrl, window.location.href).pathname;
      await Promise.all(registrations
        .filter((registration) => registration.scope === new URL(BASE_URL, window.location.href).toString()
          && [registration.active, registration.waiting, registration.installing]
            .some((worker) => worker && new URL(worker.scriptURL).pathname === expectedScriptPath))
        .map((registration) => registration.unregister()));
    }
    return;
  }
  const manifest = document.createElement('link');
  manifest.rel = 'manifest';
  manifest.href = `${BASE_URL}manifest.json`;
  document.head.appendChild(manifest);
  if ('serviceWorker' in navigator) {
    await navigator.serviceWorker.register(serviceWorkerUrl, { scope: BASE_URL });
  }
}
