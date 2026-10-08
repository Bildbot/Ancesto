import { afterEach, expect, it, vi } from 'vitest';
import { initializePwa } from './pwa';
import { isTauriDesktop } from './nativeTreeRepository';

vi.mock('./nativeTreeRepository', () => ({ isTauriDesktop: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });

it('does not register a service worker or load a manifest in desktop mode', async () => {
  vi.mocked(isTauriDesktop).mockReturnValue(true);
  const register = vi.fn();
  const unregister = vi.fn().mockResolvedValue(true);
  vi.stubGlobal('window', { location: { href: 'http://tauri.localhost/' } });
  vi.stubGlobal('navigator', { serviceWorker: { register, getRegistrations: vi.fn().mockResolvedValue([
    { scope: new URL(import.meta.env.BASE_URL, 'http://tauri.localhost/').toString(), active: { scriptURL: 'http://tauri.localhost/sw.js' }, unregister },
    { scope: 'http://tauri.localhost/other-app/', active: { scriptURL: 'http://tauri.localhost/sw.js' }, unregister: vi.fn() },
  ]) } });
  await initializePwa();
  expect(register).not.toHaveBeenCalled();
  expect(unregister).toHaveBeenCalledTimes(1);
});

it('registers the service worker and manifest under the configured base path', async () => {
  vi.mocked(isTauriDesktop).mockReturnValue(false);
  const link: { rel?: string; href?: string } = {};
  const register = vi.fn().mockResolvedValue({ update: vi.fn().mockResolvedValue(undefined) });
  vi.stubGlobal('document', {
    createElement: vi.fn(() => link),
    head: { appendChild: vi.fn() },
  });
  vi.stubGlobal('navigator', { serviceWorker: { register } });

  await initializePwa();

  expect(link).toMatchObject({ rel: 'manifest', href: `${import.meta.env.BASE_URL}manifest.json` });
  expect(register).toHaveBeenCalledWith(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL });
});
