import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

it('deletes only outdated application caches during activation', async () => {
  const listeners = new Map<string, (event: { waitUntil: (promise: Promise<unknown>) => void }) => void>();
  const deleted: string[] = [];
  const cacheNames = ['another-app-cache', 'ancesto-app-old', 'ancesto-app-current'];
  const claim = vi.fn().mockResolvedValue(undefined);
  const self = {
    registration: { scope: 'https://example.test/family/' },
    clients: { claim },
    addEventListener: (name: string, listener: (event: { waitUntil: (promise: Promise<unknown>) => void }) => void) => listeners.set(name, listener),
  };
  const caches = {
    keys: vi.fn().mockResolvedValue(cacheNames),
    delete: vi.fn(async (name: string) => { deleted.push(name); return true; }),
  };

  const workerSource = readFileSync('public/sw.js', 'utf8').replace('__APP_CACHE_NAME__', 'ancesto-app-current');
  runInNewContext(workerSource, { self, caches, URL, Promise });
  let activation: Promise<unknown> | undefined;
  listeners.get('activate')!({ waitUntil: (promise) => { activation = promise; } });
  await activation;

  expect(deleted).toEqual(['ancesto-app-old']);
  expect(claim).toHaveBeenCalledOnce();
});
