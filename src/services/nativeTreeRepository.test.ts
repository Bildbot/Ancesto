import { afterEach, describe, expect, it, vi } from 'vitest';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { exportNativeBackup, inspectNativeBackup, isTauriDesktop, restoreNativeBackup } from './nativeTreeRepository';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: vi.fn() }));

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

describe('desktop backup bridge', () => {
  it('uses the official Tauri runtime detector', () => {
    vi.stubGlobal('window', {});
    vi.mocked(isTauri).mockReturnValue(true);
    expect(isTauriDesktop()).toBe(true);
    vi.mocked(isTauri).mockReturnValue(false);
    expect(isTauriDesktop()).toBe(false);
  });

  it('exports to the selected file and reports native errors', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error('Нет доступа к файлу'));
    await expect(exportNativeBackup('C:\\backup.zip')).rejects.toThrow('Нет доступа');
    expect(invoke).toHaveBeenCalledWith('export_backup', { destination: 'C:\\backup.zip' });
  });

  it('inspects without invoking a destructive restore', async () => {
    vi.mocked(invoke).mockResolvedValue({ persons: 2, relationships: 1, media: 3 });
    expect(await inspectNativeBackup('C:\\backup.zip')).toEqual({ persons: 2, relationships: 1, media: 3 });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('inspect_backup', { source: 'C:\\backup.zip' });
  });

  it('returns the rollback location after a confirmed restore', async () => {
    vi.mocked(invoke).mockResolvedValue('C:\\backups\\before-restore.zip');
    expect(await restoreNativeBackup('C:\\backup.zip')).toBe('C:\\backups\\before-restore.zip');
    expect(invoke).toHaveBeenCalledWith('restore_backup', { source: 'C:\\backup.zip' });
  });
});
