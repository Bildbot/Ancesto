import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const tauriConfig = JSON.parse(await readFile(new URL('src-tauri/tauri.conf.json', root), 'utf8'));
const cargoToml = await readFile(new URL('src-tauri/Cargo.toml', root), 'utf8');
const cargoLock = await readFile(new URL('src-tauri/Cargo.lock', root), 'utf8');
const expected = packageJson.version;
const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const lockVersion = cargoLock.match(/\[\[package\]\]\s+name = "app"\s+version = "([^"]+)"/)?.[1];
const versions = {
  'package.json': expected,
  'src-tauri/Cargo.toml': cargoVersion,
  'src-tauri/Cargo.lock (app)': lockVersion,
  'src-tauri/tauri.conf.json': tauriConfig.version,
};
const mismatches = Object.entries(versions).filter(([, version]) => version !== expected);

if (mismatches.length) {
  console.error(`Version mismatch: expected ${expected}`);
  for (const [file, version] of mismatches) console.error(`  ${file}: ${version ?? 'not found'}`);
  process.exitCode = 1;
} else {
  console.log(`All application manifests use version ${expected}.`);
}
