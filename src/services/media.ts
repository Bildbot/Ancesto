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

export function validateMediaFile(file: Pick<File, 'type'>): string | null {
  if (!ALLOWED_MEDIA_TYPES.has(file.type)) {
    return 'Тип файла не поддерживается.';
  }
  return null;
}

export function readFileAsDataUrl(file: File, onProgress?: (progress: number) => void): Promise<string> {
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
