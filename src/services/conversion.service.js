import { createWriteStream } from 'node:fs';
import { access, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
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

function sortNaturally(files) {
  return [...files].sort((first, second) => first.localeCompare(second, undefined, { numeric: true }));
}

async function command(binary, argumentsList, errorMessage, options = {}) {
  try {
    return await execFileAsync(binary, argumentsList, { timeout: 120_000, ...options });
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`${binary} is not available on this server. ${errorMessage}`);
    throw new Error(errorMessage);
  }
}

async function resultFromFiles(files, requestDirectory, archiveFilename = 'filemind-results.zip') {
  if (files.length === 1) {
    const file = files[0];
    return { path: file, filename: path.basename(file), mimeType: formatMimeType(extensionOf(file)), directory: requestDirectory };
  }
  const archivePath = path.join(requestDirectory, archiveFilename);
  await makeArchive(files, archivePath);
  return { path: archivePath, filename: archiveFilename, mimeType: formatMimeType('zip'), directory: requestDirectory };
}

async function mergePdfs(files, requestDirectory) {
  const outputPath = path.join(requestDirectory, 'filemind-merged.pdf');
  await command('pdfunite', [...files.map((file) => file.path), outputPath], 'FileMind could not merge these PDFs. Check that they are not password protected.');
  return { path: outputPath, filename: 'filemind-merged.pdf', mimeType: formatMimeType('pdf'), directory: requestDirectory };
}

async function splitPdfs(files, requestDirectory, options) {
  const generated = [];
  for (const file of files) {
    const baseName = safeBaseName(file.originalname);
    const pattern = path.join(requestDirectory, `${baseName}-page-%d.pdf`);
    const argumentsList = [];
    if (options.operation === 'pdf-extract' && options.pageStart) argumentsList.push('-f', String(options.pageStart));
    if (options.operation === 'pdf-extract' && options.pageEnd) argumentsList.push('-l', String(options.pageEnd));
    argumentsList.push(file.path, pattern);
    await command('pdfseparate', argumentsList, 'FileMind could not extract pages from this PDF. Check that it is not password protected.');
    const pages = sortNaturally((await readdir(requestDirectory))
      .filter((name) => name.startsWith(`${baseName}-page-`) && name.endsWith('.pdf'))
      .map((name) => path.join(requestDirectory, name)));
    generated.push(...pages);
  }
  if (!generated.length) throw new Error('No PDF pages could be extracted.');
  return resultFromFiles(generated, requestDirectory, 'filemind-extracted-pages.zip');
}

async function compressPdfs(files, requestDirectory) {
  const generated = [];
  for (const file of files) {
    const outputPath = path.join(requestDirectory, `${safeBaseName(file.originalname)}-compressed.pdf`);
    await command('gs', [
      '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.4', '-dPDFSETTINGS=/ebook',
      '-dNOPAUSE', '-dQUIET', '-dBATCH', `-sOutputFile=${outputPath}`, file.path
    ], 'FileMind could not compress this PDF. Check that it is not password protected.');
    generated.push(outputPath);
  }
  return resultFromFiles(generated, requestDirectory, 'filemind-compressed-pdfs.zip');
}

async function convertDocumentsToPdf(files, requestDirectory) {
  const generated = [];
  const profileDirectory = path.join(requestDirectory, 'office-profile');
  await ensureDirectory(profileDirectory);
  for (const file of files) {
    await command('soffice', [
      '--headless', `-env:UserInstallation=${pathToFileURL(profileDirectory).href}`,
      '--convert-to', 'pdf', '--outdir', requestDirectory, file.path
    ], 'FileMind could not convert this document. Check that it is a supported, unprotected Office file.');
    const generatedPath = path.join(requestDirectory, `${path.basename(file.path, path.extname(file.path))}.pdf`);
    const outputPath = path.join(requestDirectory, `${safeBaseName(file.originalname)}.pdf`);
    const exists = await stat(generatedPath).catch(() => null);
    if (!exists) throw new Error(`${file.originalname} could not be converted to PDF.`);
    await rename(generatedPath, outputPath);
    generated.push(outputPath);
  }
  return resultFromFiles(generated, requestDirectory, 'filemind-documents-as-pdf.zip');
}

async function extractOcrText(files, requestDirectory, options) {
  const generated = [];
  for (const file of files) {
    const baseName = safeBaseName(file.originalname);
    const outputPath = path.join(requestDirectory, `${baseName}-ocr.txt`);
    if (isPdfFile(file.originalname)) {
      const pagePrefix = path.join(requestDirectory, `${baseName}-ocr-page`);
      await command('pdftoppm', ['-r', '200', '-png', file.path, pagePrefix], 'FileMind could not read this PDF for OCR.');
      const pages = sortNaturally((await readdir(requestDirectory))
        .filter((name) => name.startsWith(`${baseName}-ocr-page-`) && name.endsWith('.png'))
        .map((name) => path.join(requestDirectory, name)));
      if (!pages.length) throw new Error('No readable pages were found for OCR.');
      const pageText = [];
      for (let index = 0; index < pages.length; index += 1) {
        const textBase = path.join(requestDirectory, `${baseName}-page-text-${index + 1}`);
        await command('tesseract', [pages[index], textBase, '-l', options.ocrLanguage, 'txt'], 'FileMind could not recognize text in this PDF.');
        pageText.push(`--- Page ${index + 1} ---\n${await readFile(`${textBase}.txt`, 'utf8')}`);
        await rm(pages[index], { force: true });
        await rm(`${textBase}.txt`, { force: true });
      }
      await writeFile(outputPath, pageText.join('\n\n').trim() + '\n');
    } else {
      const textBase = path.join(requestDirectory, `${baseName}-ocr`);
      await command('tesseract', [file.path, textBase, '-l', options.ocrLanguage, 'txt'], 'FileMind could not recognize text in this image.');
      await rename(`${textBase}.txt`, outputPath);
    }
    generated.push(outputPath);
  }
  return resultFromFiles(generated, requestDirectory, 'filemind-ocr-text.zip');
}

export async function convertFiles(files, options, requestId) {
  const requestDirectory = path.join(outputDirectory, requestId);
  await ensureDirectory(requestDirectory);

  if (options.operation === 'pdf-merge') return mergePdfs(files, requestDirectory);
  if (options.operation === 'pdf-split' || options.operation === 'pdf-extract') return splitPdfs(files, requestDirectory, options);
  if (options.operation === 'pdf-compress') return compressPdfs(files, requestDirectory);
  if (options.operation === 'document-pdf') return convertDocumentsToPdf(files, requestDirectory);
  if (options.operation === 'ocr') return extractOcrText(files, requestDirectory, options);

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
