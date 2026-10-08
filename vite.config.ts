import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {defineConfig} from 'vite';

function pwaPrecachePlugin() {
  let precacheUrls: string[] = [];

  return {
    name: 'ancesto-pwa-precache',
    apply: 'build' as const,
    generateBundle(_options: unknown, bundle: Record<string, { type: string; fileName: string }>) {
      const publicFiles = ['index.html', 'manifest.json', 'icon.svg'];
      const bundleFiles = Object.values(bundle).filter((item) => item.type === 'chunk' || item.type === 'asset')
        .map((item) => item.fileName);
      precacheUrls = [...new Set([...publicFiles, ...bundleFiles])]
        .filter((file) => file !== 'sw.js')
        .sort();
    },
    closeBundle() {
      const workerPath = path.resolve(import.meta.dirname, 'dist/sw.js');
      const source = fs.readFileSync(workerPath, 'utf8');
      const version = crypto.createHash('sha256').update(precacheUrls.join('\n')).digest('hex').slice(0, 12);
      const worker = source
        .replace('__APP_CACHE_NAME__', `ancesto-app-${version}`)
        .replace('const PRECACHE_URLS = [];', `const PRECACHE_URLS = ${JSON.stringify(precacheUrls)};`);
      fs.writeFileSync(workerPath, worker);
    },
  };
}

export default defineConfig(() => {
  const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1];
  const base = process.env.GITHUB_PAGES === 'true' && repositoryName
    ? `/${repositoryName}/`
    : './';

  return {
    base,
    plugins: [react(), tailwindcss(), pwaPrecachePlugin()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      port: 3000,
      strictPort: true,
      host: '127.0.0.1',
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
