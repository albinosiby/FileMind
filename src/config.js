import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(currentDirectory, '..');
export const publicDirectory = path.join(projectRoot, 'public');
export const uploadDirectory = path.join(projectRoot, 'uploads');
export const outputDirectory = path.join(projectRoot, 'outputs');

export const MAX_FILE_SIZE = 25 * 1024 * 1024;
export const MAX_FILES = 10;
export const RETENTION_MS = 15 * 60 * 1000;
