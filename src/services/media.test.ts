import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileAsDataUrl, validateMediaFile } from './media';

const originalFileReader = globalThis.FileReader;

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: originalFileReader });
});

describe('media upload validation', () => {
  it('rejects unsupported media types but accepts arbitrarily large supported files', () => {
    expect(validateMediaFile({ type: 'application/x-msdownload', size: 100 } as File)).toContain('не поддерживается');
    expect(validateMediaFile({ type: 'video/mp4', size: 50 * 1024 * 1024 * 1024 } as File)).toBeNull();
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

    await expect(readFileAsDataUrl({} as File)).rejects.toThrow('Не удалось прочитать файл');
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
    await expect(readFileAsDataUrl({} as File, (value) => progress.push(value)))
      .resolves.toBe('data:video/mp4;base64,AA==');
    expect(progress).toEqual([50, 100, 100]);
  });
});
