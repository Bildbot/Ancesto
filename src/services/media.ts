export const MAX_MEDIA_FILE_SIZE = 25 * 1024 * 1024;

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

export function validateMediaFile(file: Pick<File, 'size' | 'type'>): string | null {
  if (!ALLOWED_MEDIA_TYPES.has(file.type)) {
    return 'Тип файла не поддерживается.';
  }
  if (file.size > MAX_MEDIA_FILE_SIZE) {
    return 'Файл слишком большой. Максимальный размер: 25 МБ.';
  }
  return null;
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') {
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
