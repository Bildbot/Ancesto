const ALLOWED_MEDIA_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
  'video/mp4',
  'video/webm',
]);

const MiB = 1024 * 1024;
export const MEDIA_SIZE_LIMITS = {
  web: { photo: 10 * MiB, document: 10 * MiB, video: 25 * MiB, audio: 10 * MiB, archive: 64 * MiB },
  desktop: { photo: 25 * MiB, document: 25 * MiB, video: 50 * MiB, audio: 25 * MiB, archive: 64 * MiB },
} as const;

export function isDesktopMediaRuntime(): boolean {
  return typeof window !== 'undefined'
    && Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

export function formatFileSize(bytes: number): string {
  return `${(bytes / MiB).toFixed(1)} МБ`;
}

export function getMediaSizeLimit(file: Pick<File, 'type'>, desktop = isDesktopMediaRuntime()): number {
  const limits = desktop ? MEDIA_SIZE_LIMITS.desktop : MEDIA_SIZE_LIMITS.web;
  if (file.type.startsWith('image/')) return limits.photo;
  if (file.type.startsWith('video/')) return limits.video;
  if (file.type.startsWith('audio/')) return limits.audio;
  return limits.document;
}

export function validateMediaFile(file: Pick<File, 'type' | 'size'>, desktop = isDesktopMediaRuntime()): string | null {
  if (!ALLOWED_MEDIA_TYPES.has(file.type)) {
    return 'Тип файла не поддерживается.';
  }
  const limit = getMediaSizeLimit(file, desktop);
  if (file.size > limit) {
    return `Файл слишком большой: ${formatFileSize(file.size)}. Допустимый размер для этого типа: ${formatFileSize(limit)}.`;
  }
  return null;
}

export function readFileAsDataUrl(file: File, onProgress?: (progress: number) => void): Promise<string> {
  const validationError = validateMediaFile(file);
  if (validationError) return Promise.reject(new Error(validationError));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') {
        onProgress?.(100);
        resolve(event.target.result);
      } else {
        reject(new Error('Не удалось прочитать файл.'));
      }
    };
    reader.onerror = () => reject(new Error('Не удалось прочитать файл.'));
    reader.onabort = () => reject(new Error('Чтение файла отменено.'));
    reader.readAsDataURL(file);
  });
}
