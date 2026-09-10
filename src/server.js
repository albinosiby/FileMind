import express from 'express';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { outputDirectory, publicDirectory, RETENTION_MS, uploadDirectory } from './config.js';
import { conversionRouter } from './routes/conversion.routes.js';

await Promise.all([mkdir(uploadDirectory, { recursive: true }), mkdir(outputDirectory, { recursive: true })]);

async function clearExpiredFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const threshold = Date.now() - RETENTION_MS;
  await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    const details = await stat(target).catch(() => null);
    if (details && details.mtimeMs < threshold) await rm(target, { recursive: true, force: true });
  }));
}

await Promise.all([clearExpiredFiles(uploadDirectory), clearExpiredFiles(outputDirectory)]);
setInterval(() => Promise.all([clearExpiredFiles(uploadDirectory), clearExpiredFiles(outputDirectory)]), RETENTION_MS).unref();

const app = express();
app.disable('x-powered-by');
app.use(express.static(publicDirectory, { extensions: ['html'] }));
app.use('/api', conversionRouter);
app.use((error, _request, response, _next) => {
  const message = error.code === 'LIMIT_FILE_SIZE'
    ? 'A file is larger than the 25 MB limit.'
    : error.message || 'Something went wrong while processing your files.';
  response.status(400).json({ error: message });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`FileMind is running at http://localhost:${port}`));
