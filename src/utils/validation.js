import { MAX_FILES, MAX_FILE_SIZE } from '../config.js';
import { extensionOf, isSupportedInput, normalizedFormat, OUTPUT_FORMATS } from './file-utils.js';

export function assertFiles(files) {
  if (!files?.length) throw new Error('Choose at least one file to continue.');
  if (files.length > MAX_FILES) throw new Error(`You can convert up to ${MAX_FILES} files at one time.`);

  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) throw new Error(`${file.originalname} is larger than 25 MB.`);
    if (!isSupportedInput(file.originalname)) {
      throw new Error(`${file.originalname} is not a supported file type.`);
    }
  }
}

export function parseOptions(body) {
  const outputFormat = normalizedFormat(body.outputFormat);
  if (!OUTPUT_FORMATS.has(outputFormat)) throw new Error('Choose a valid output format.');

  const operation = ['convert', 'compress', 'resize', 'crop'].includes(body.operation)
    ? body.operation
    : 'convert';
  const quality = Number(body.quality ?? 82);
  const width = Number(body.width || 0);
  const height = Number(body.height || 0);

  if (!Number.isFinite(quality) || quality < 20 || quality > 100) {
    throw new Error('Quality must be between 20 and 100.');
  }
  if ((operation === 'resize' || operation === 'crop') && !width && !height) {
    throw new Error('Add a width or height before continuing.');
  }
  if (width > 10000 || height > 10000 || width < 0 || height < 0) {
    throw new Error('Dimensions must be between 1 and 10,000 pixels.');
  }

  return { outputFormat, operation, quality, width, height, fit: body.fit === 'contain' ? 'contain' : 'cover' };
}

export function validateConversionCompatibility(files, options) {
  const hasPdf = files.some((file) => extensionOf(file.originalname) === 'pdf');
  if (hasPdf && options.outputFormat === 'pdf') {
    throw new Error('PDF files can be converted to JPG, PNG, or WebP images.');
  }
  if (hasPdf && options.operation !== 'convert') {
    throw new Error('Resize, crop, and compression are available for images only.');
  }
  if (options.outputFormat === 'pdf' && options.operation !== 'convert') {
    throw new Error('Choose “Convert” to create a PDF. Image editing tools export image formats.');
  }
}
