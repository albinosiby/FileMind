import { MAX_FILES, MAX_FILE_SIZE } from '../config.js';
import { isImageFile, isOfficeFile, isPdfFile, isSupportedInput, normalizedFormat, OUTPUT_FORMATS } from './file-utils.js';

const OPERATIONS = new Set([
  'convert', 'compress', 'resize', 'crop',
  'pdf-merge', 'pdf-split', 'pdf-extract', 'pdf-compress',
  'document-pdf', 'ocr'
]);

const FIXED_OUTPUTS = {
  'pdf-merge': 'pdf',
  'pdf-split': 'pdf',
  'pdf-extract': 'pdf',
  'pdf-compress': 'pdf',
  'document-pdf': 'pdf',
  ocr: 'txt'
};

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
  const operation = OPERATIONS.has(body.operation) ? body.operation : 'convert';
  const outputFormat = FIXED_OUTPUTS[operation] || normalizedFormat(body.outputFormat);
  if (operation === 'convert' && !OUTPUT_FORMATS.has(outputFormat)) throw new Error('Choose a valid output format.');
  const quality = Number(body.quality ?? 82);
  const width = Number(body.width || 0);
  const height = Number(body.height || 0);
  const pageStart = Number(body.pageStart || 0);
  const pageEnd = Number(body.pageEnd || 0);

  if (!Number.isFinite(quality) || quality < 20 || quality > 100) {
    throw new Error('Quality must be between 20 and 100.');
  }
  if ((operation === 'resize' || operation === 'crop') && !width && !height) {
    throw new Error('Add a width or height before continuing.');
  }
  if (width > 10000 || height > 10000 || width < 0 || height < 0) {
    throw new Error('Dimensions must be between 1 and 10,000 pixels.');
  }
  if (pageStart < 0 || pageEnd < 0 || pageStart > 10000 || pageEnd > 10000 || (pageEnd && pageStart > pageEnd)) {
    throw new Error('Choose a valid page range.');
  }

  return {
    outputFormat, operation, quality, width, height,
    pageStart, pageEnd,
    ocrLanguage: body.ocrLanguage === 'eng' ? 'eng' : 'eng',
    fit: body.fit === 'contain' ? 'contain' : 'cover'
  };
}

export function validateConversionCompatibility(files, options) {
  const hasPdf = files.some((file) => isPdfFile(file.originalname));
  const allPdfs = files.every((file) => isPdfFile(file.originalname));
  const allImages = files.every((file) => isImageFile(file.originalname));
  const allOfficeFiles = files.every((file) => isOfficeFile(file.originalname));

  if (options.operation === 'pdf-merge') {
    if (!allPdfs || files.length < 2) throw new Error('Choose at least two PDF files to merge.');
    return;
  }
  if (['pdf-split', 'pdf-extract', 'pdf-compress'].includes(options.operation)) {
    if (!allPdfs) throw new Error('This PDF tool accepts PDF files only.');
    return;
  }
  if (options.operation === 'document-pdf') {
    if (!allOfficeFiles) throw new Error('Document to PDF accepts Word, Excel, PowerPoint, OpenDocument, CSV, or RTF files only.');
    return;
  }
  if (options.operation === 'ocr') {
    if (!files.every((file) => isPdfFile(file.originalname) || isImageFile(file.originalname))) {
      throw new Error('OCR accepts PDF and image files only.');
    }
    return;
  }
  if (options.operation === 'convert' && !files.every((file) => isPdfFile(file.originalname) || isImageFile(file.originalname))) {
    throw new Error('Use “Document → PDF” for Word, Excel, PowerPoint, OpenDocument, CSV, and RTF files.');
  }
  if (hasPdf && options.outputFormat === 'pdf') {
    throw new Error('PDF files can be converted to JPG, PNG, or WebP images.');
  }
  if (!allImages && options.operation !== 'convert') {
    throw new Error('Resize, crop, and compression are available for images only.');
  }
  if (options.outputFormat === 'pdf' && options.operation !== 'convert') {
    throw new Error('Choose “Convert” to create a PDF. Image editing tools export image formats.');
  }
}
