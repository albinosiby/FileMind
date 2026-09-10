import crypto from 'node:crypto';
import path from 'node:path';
import multer from 'multer';
import { MAX_FILES, MAX_FILE_SIZE, uploadDirectory } from '../config.js';
import { isSupportedInput } from '../utils/file-utils.js';

const storage = multer.diskStorage({
  destination: uploadDirectory,
  filename: (_request, file, callback) => {
    callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
  }
});

export const uploadFiles = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
  fileFilter: (_request, file, callback) => {
    callback(null, isSupportedInput(file.originalname));
  }
}).array('files', MAX_FILES);
