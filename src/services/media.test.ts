import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileAsDataUrl, validateMediaFile } from './media';

const originalFileReader = globalThis.FileReader;

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: originalFileReader });
});

describe('media upload validation', () => {
  it('rejects unsupported types and enforces web and desktop per-kind boundaries', () => {
    expect(validateMediaFile({ type: 'application/x-msdownload', size: 100 } as File)).toContain('не поддерживается');
    for (const [type, limit] of [
      ['image/png', 10], ['application/pdf', 10], ['video/mp4', 25], ['audio/wav', 10],
    ] as const) {
      expect(validateMediaFile({ type, size: limit * 1024 * 1024 }, false)).toBeNull();
      expect(validateMediaFile({ type, size: limit * 1024 * 1024 + 1 }, false)).toContain('Допустимый размер');
    }
    expect(validateMediaFile({ type: 'image/jpeg', size: 25 * 1024 * 1024 }, true)).toBeNull();
    expect(validateMediaFile({ type: 'image/jpeg', size: 25 * 1024 * 1024 + 1 }, true)).toContain('25.0 МБ');
  });

  it('rejects an oversized file before constructing or invoking FileReader', async () => {
    const reader = vi.fn();
    Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: class { readAsDataURL = reader; } });
    await expect(readFileAsDataUrl({ type: 'video/mp4', size: 25 * 1024 * 1024 + 1 } as File)).rejects.toThrow('25.0 МБ');
    expect(reader).not.toHaveBeenCalled();
  });

  it('rejects when FileReader cannot read the selected file', async () => {
    class FailingFileReader {
      onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;
      onabort: ((event: ProgressEvent<FileReader>) => void) | null = null;
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null;

      readAsDataURL() {
        queueMicrotask(() => this.onerror?.(new Event('error') as ProgressEvent<FileReader>));
      }
    }

    Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: FailingFileReader });

    await expect(readFileAsDataUrl({ type: 'video/mp4', size: 1 } as File)).rejects.toThrow('Не удалось прочитать файл');
  });

  it('reports file read progress', async () => {
    class SuccessfulFileReader {
      onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;
      onabort: ((event: ProgressEvent<FileReader>) => void) | null = null;
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
      onprogress: ((event: ProgressEvent<FileReader>) => void) | null = null;

      readAsDataURL() {
        this.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 } as ProgressEvent<FileReader>);
        this.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 } as ProgressEvent<FileReader>);
        this.onload?.({ target: { result: 'data:video/mp4;base64,AA==' } } as ProgressEvent<FileReader>);
      }
    }

    Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: SuccessfulFileReader });
    const progress: number[] = [];
    await expect(readFileAsDataUrl({ type: 'video/mp4', size: 1 } as File, (value) => progress.push(value)))
      .resolves.toBe('data:video/mp4;base64,AA==');
    expect(progress).toEqual([50, 100, 100]);
  });
});
