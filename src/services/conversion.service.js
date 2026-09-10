import { createWriteStream } from 'node:fs';
import { access, mkdir, readdir, rm, stat } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import archiver from 'archiver';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import { outputDirectory } from '../config.js';
import { extensionOf, formatMimeType, isImageFile, isPdfFile, normalizedFormat, safeBaseName } from '../utils/file-utils.js';

const execFileAsync = promisify(execFile);

async function ensureDirectory(directory) {
  await mkdir(directory, { recursive: true });
}

function imagePipeline(inputPath, options) {
  let pipeline = sharp(inputPath, { animated: false, limitInputPixels: 64_000_000 }).rotate();
  if (options.operation === 'resize') {
    pipeline = pipeline.resize({
      width: options.width || undefined,
      height: options.height || undefined,
      fit: options.fit,
      withoutEnlargement: true
    });
  }
  if (options.operation === 'crop') {
    pipeline = pipeline.resize({
      width: options.width || undefined,
      height: options.height || undefined,
      fit: 'cover',
      position: 'centre'
    });
  }
  return pipeline;
}

async function writeImage(inputPath, originalFilename, destination, options) {
  const sourceFormat = extensionOf(originalFilename);
  let processingPath = inputPath;
  let temporarySource;
  if (sourceFormat === 'heic' || sourceFormat === 'heif') {
    temporarySource = path.join(path.dirname(destination), `heic-source-${crypto.randomUUID()}.jpg`);
    try {
      await execFileAsync('convert', [inputPath, temporarySource], { timeout: 60_000 });
      processingPath = temporarySource;
    } catch {
      throw new Error('This HEIC file cannot be decoded. Try another file or verify HEIC support on the server.');
    }
  }

  const pipeline = imagePipeline(processingPath, options);
  const format = normalizedFormat(options.outputFormat);
  try {
    if (format === 'jpg') return await pipeline.jpeg({ quality: options.quality, mozjpeg: true }).toFile(destination);
    if (format === 'png') return await pipeline.png({ compressionLevel: 9, quality: options.quality, palette: options.operation === 'compress' }).toFile(destination);
    if (format === 'webp') return await pipeline.webp({ quality: options.quality }).toFile(destination);
    throw new Error('This image output format is not supported.');
  } finally {
    if (temporarySource) await rm(temporarySource, { force: true });
  }
}

async function createPdfFromImages(files, destination) {
  const document = new PDFDocument({ autoFirstPage: false, margin: 0 });
  const stream = createWriteStream(destination);
  document.pipe(stream);

  for (const file of files) {
    if (!isImageFile(file.originalname)) throw new Error('Only image files can be combined into a PDF.');
    const metadata = await sharp(file.path).metadata();
    const width = Math.max(1, metadata.width || 595);
    const height = Math.max(1, metadata.height || 842);
    document.addPage({ size: [width, height], margin: 0 });
    document.image(file.path, 0, 0, { width, height });
  }
  document.end();
  await new Promise((resolve, reject) => stream.once('finish', resolve).once('error', reject));
}

async function convertPdfToImages(file, requestDirectory, options) {
  const prefix = path.join(requestDirectory, safeBaseName(file.originalname));
  const popplerFormat = options.outputFormat === 'jpg' ? 'jpeg' : 'png';
  const argumentsList = ['-r', '160', `-${popplerFormat}`, file.path, prefix];
  try {
    await execFileAsync('pdftoppm', argumentsList, { timeout: 60_000 });
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('PDF conversion is not available on this server. Install Poppler and try again.');
    throw new Error('This PDF could not be converted. Check that it is not password protected or damaged.');
  }

  const generated = await readdir(requestDirectory);
  const popplerExtension = popplerFormat === 'jpeg' ? 'jpg' : 'png';
  const pageFiles = generated
    .filter((name) => name.startsWith(`${safeBaseName(file.originalname)}-`) && name.endsWith(`.${popplerExtension}`))
    .sort()
    .map((name) => path.join(requestDirectory, name));

  if (!pageFiles.length) throw new Error('No pages could be read from this PDF.');

  if (options.outputFormat === 'webp') {
    const webpFiles = [];
    for (const pageFile of pageFiles) {
      const webpFile = pageFile.replace(/\.(png|jpg)$/, '.webp');
      await sharp(pageFile).webp({ quality: options.quality }).toFile(webpFile);
      await rm(pageFile, { force: true });
      webpFiles.push(webpFile);
    }
    return webpFiles;
  }
  return pageFiles;
}

async function makeArchive(files, destination) {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const stream = createWriteStream(destination);
  archive.pipe(stream);
  for (const file of files) archive.file(file, { name: path.basename(file) });
  const finished = new Promise((resolve, reject) => stream.once('close', resolve).once('error', reject));
  await archive.finalize();
  await finished;
}

export async function convertFiles(files, options, requestId) {
  const requestDirectory = path.join(outputDirectory, requestId);
  await ensureDirectory(requestDirectory);

  if (options.outputFormat === 'pdf') {
    const outputPath = path.join(requestDirectory, 'filemind-converted.pdf');
    await createPdfFromImages(files, outputPath);
    return { path: outputPath, filename: 'filemind-converted.pdf', mimeType: formatMimeType('pdf'), directory: requestDirectory };
  }

  const generated = [];
  for (const file of files) {
    if (isPdfFile(file.originalname)) {
      generated.push(...await convertPdfToImages(file, requestDirectory, options));
      continue;
    }
    const outputPath = path.join(requestDirectory, `${safeBaseName(file.originalname)}.${normalizedFormat(options.outputFormat)}`);
    try {
      await writeImage(file.path, file.originalname, outputPath, options);
      generated.push(outputPath);
    } catch (error) {
      throw new Error(`${file.originalname} could not be processed. Make sure it is a valid image file.`);
    }
  }

  if (generated.length === 1) {
    return { path: generated[0], filename: path.basename(generated[0]), mimeType: formatMimeType(options.outputFormat), directory: requestDirectory };
  }

  const archivePath = path.join(requestDirectory, 'filemind-converted-files.zip');
  await makeArchive(generated, archivePath);
  return { path: archivePath, filename: 'filemind-converted-files.zip', mimeType: 'application/zip', directory: requestDirectory };
}

export async function removeDirectory(directory) {
  if (directory) await rm(directory, { recursive: true, force: true });
}

export async function fileExists(filePath) {
  try {
    await access(filePath);
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}
