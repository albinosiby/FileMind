import test from 'node:test';
import assert from 'node:assert/strict';
import { extensionOf, isSupportedInput, normalizedFormat, safeBaseName } from '../src/utils/file-utils.js';
import { parseOptions } from '../src/utils/validation.js';

test('normalizes common image names and formats', () => {
  assert.equal(extensionOf('holiday.PnG'), 'png');
  assert.equal(normalizedFormat('JPEG'), 'jpg');
  assert.equal(safeBaseName('My final image!.png'), 'My-final-image');
});

test('accepts only supported source file types', () => {
  assert.equal(isSupportedInput('logo.svg'), true);
  assert.equal(isSupportedInput('scan.pdf'), true);
  assert.equal(isSupportedInput('archive.zip'), false);
});

test('rejects invalid conversion options', () => {
  assert.throws(() => parseOptions({ outputFormat: 'zip' }), /valid output format/);
  assert.throws(() => parseOptions({ outputFormat: 'png', operation: 'resize' }), /width or height/);
});
