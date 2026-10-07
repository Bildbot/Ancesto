import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_MEDIA_FILE_SIZE, readFileAsDataUrl, validateMediaFile } from './media';

const originalFileReader = globalThis.FileReader;

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: originalFileReader });
});

describe('media upload validation', () => {
  it('rejects unsupported media types and files over the size limit', () => {
    expect(validateMediaFile({ type: 'application/x-msdownload', size: 100 } as File)).toContain('не поддерживается');
    expect(validateMediaFile({ type: 'image/jpeg', size: MAX_MEDIA_FILE_SIZE + 1 } as File)).toContain('слишком большой');
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
});
