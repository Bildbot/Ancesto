import { afterEach, expect, it, vi } from 'vitest';
import { initializePwa } from './pwa';
import { isTauriDesktop } from './nativeTreeRepository';

vi.mock('./nativeTreeRepository', () => ({ isTauriDesktop: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });

it('does not register a service worker or load a manifest in desktop mode', async () => {
  vi.mocked(isTauriDesktop).mockReturnValue(true);
  const register = vi.fn();
  const unregister = vi.fn().mockResolvedValue(true);
  vi.stubGlobal('navigator', { serviceWorker: { register, getRegistrations: vi.fn().mockResolvedValue([
    { active: { scriptURL: 'http://tauri.localhost/sw.js' }, unregister },
  ]) } });
  await initializePwa();
  expect(register).not.toHaveBeenCalled();
  expect(unregister).toHaveBeenCalledTimes(1);
});
