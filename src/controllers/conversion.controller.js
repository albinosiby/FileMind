import crypto from 'node:crypto';
import { rm } from 'node:fs/promises';
import { convertFiles, removeDirectory } from '../services/conversion.service.js';
import { parseOptions, assertFiles, validateConversionCompatibility } from '../utils/validation.js';

export async function convert(request, response, next) {
  const files = request.files || [];
  let outputDirectory;
  try {
    assertFiles(files);
    const options = parseOptions(request.body);
    validateConversionCompatibility(files, options);
    const result = await convertFiles(files, options, crypto.randomUUID());
    outputDirectory = result.directory;

    response.setHeader('Content-Type', result.mimeType);
    response.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    response.download(result.path, result.filename, async (error) => {
      await removeDirectory(outputDirectory);
      await Promise.all(files.map((file) => rm(file.path, { force: true })));
      if (error && !response.headersSent) next(error);
    });
  } catch (error) {
    await removeDirectory(outputDirectory);
    await Promise.all(files.map((file) => rm(file.path, { force: true })));
    next(error);
  }
}
