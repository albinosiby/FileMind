import path from 'node:path';

export const IMAGE_FORMATS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'svg']);
export const INPUT_FORMATS = new Set([...IMAGE_FORMATS, 'pdf']);
export const OUTPUT_FORMATS = new Set(['jpg', 'png', 'webp', 'pdf']);

export function extensionOf(filename) {
  return path.extname(filename).slice(1).toLowerCase();
}

export function normalizedFormat(format) {
  const value = String(format || '').toLowerCase();
  return value === 'jpeg' ? 'jpg' : value;
}

export function safeBaseName(filename) {
  return path
    .basename(filename, path.extname(filename))
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'converted-file';
}

export function isImageFile(filename) {
  return IMAGE_FORMATS.has(extensionOf(filename));
}

export function isPdfFile(filename) {
  return extensionOf(filename) === 'pdf';
}

export function isSupportedInput(filename) {
  return INPUT_FORMATS.has(extensionOf(filename));
}

export function formatMimeType(format) {
  return {
    jpg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    pdf: 'application/pdf'
  }[normalizedFormat(format)] || 'application/octet-stream';
}
