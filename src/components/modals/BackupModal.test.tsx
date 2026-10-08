// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackupModal } from './BackupModal';
import type { FamilyTreeData } from '../../types/genealogy';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../../services/db', () => ({
  exportTreeAsJson: vi.fn(), exportTreeAsGedcom: vi.fn(), importTreeFromGedcom: vi.fn(),
  validateImportedData: (value: unknown) => value, saveFamilyTree: vi.fn(), waitForPendingSaves: vi.fn(),
}));
vi.mock('../../services/nativeTreeRepository', () => ({
  isTauriDesktop: () => false, exportNativeBackup: vi.fn(), inspectNativeBackup: vi.fn(), restoreNativeBackup: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: vi.fn() }));

const tree: FamilyTreeData = { treeName: 'Тест', description: '', persons: [], relationships: [], mediaArchive: [], lastModified: 1, version: 1 };
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;

async function chooseAndConfirmImport(onImportData: (data: FamilyTreeData) => Promise<void>) {
  await act(async () => {
    root.render(<BackupModal isOpen onClose={vi.fn()} treeData={tree} onImportData={onImportData} onResetToDemo={vi.fn()} onClearTree={vi.fn()} />);
  });
  const fileInput = host.querySelector('input[type="file"]')!;
  const payload = { ...tree, treeName: 'Импорт' };
  const file = new File([JSON.stringify(payload)], 'backup.json', { type: 'application/json' });
  await act(async () => {
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  await act(async () => {
    Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('Заменить архив'))?.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.clearAllMocks();
});

describe('BackupModal import confirmation', () => {
  it('shows success only after the asynchronous import commits', async () => {
    let commit!: () => void;
    const onImportData = vi.fn(() => new Promise<void>((resolve) => { commit = resolve; }));
    await chooseAndConfirmImport(onImportData);
    expect(host.textContent).not.toContain('успешно загружен');
    await act(async () => commit());
    expect(host.textContent).toContain('успешно загружен');
  });

  it('shows the commit failure instead of a success message', async () => {
    const onImportData = vi.fn().mockRejectedValue(new Error('Не удалось сохранить'));
    await chooseAndConfirmImport(onImportData);
    expect(host.textContent).toContain('Не удалось сохранить');
    expect(host.textContent).not.toContain('успешно загружен');
  });
});
