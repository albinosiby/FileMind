const fileInput = document.querySelector('#file-input');
const dropZone = document.querySelector('#drop-zone');
const chooseFiles = document.querySelector('#choose-files');
const addFiles = document.querySelector('#add-files');
const clearFiles = document.querySelector('#clear-files');
const changeAction = document.querySelector('#change-action');
const actionPicker = document.querySelector('#action-picker');
const uploadPanel = document.querySelector('#workspace');
const uploadTitle = document.querySelector('#upload-title');
const uploadHelp = document.querySelector('#upload-help');
const selectedActionLabel = document.querySelector('#selected-action-label');
const fileWorkspace = document.querySelector('#file-workspace');
const fileList = document.querySelector('#file-list');
const fileCount = document.querySelector('#file-count');
const outputFormat = document.querySelector('#output-format');
const outputFormatField = document.querySelector('.output-format-field');
const quality = document.querySelector('#quality');
const qualityValue = document.querySelector('#quality-value');
const widthInput = document.querySelector('#width');
const heightInput = document.querySelector('#height');
const fitInput = document.querySelector('#fit');
const pageStartInput = document.querySelector('#page-start');
const pageEndInput = document.querySelector('#page-end');
const ocrLanguageInput = document.querySelector('#ocr-language');
const settingsHint = document.querySelector('#settings-hint');
const convertForm = document.querySelector('#convert-form');
const convertButton = document.querySelector('#convert-button');
const statusMessage = document.querySelector('#status-message');
const actionOptions = document.querySelectorAll('.action-option');

const MAX_FILES = 10;
const MAX_SIZE = 25 * 1024 * 1024;
const imageExtensions = new Set(['jpg', 'jpeg', 'png', 'webp', 'svg', 'heic', 'heif']);
const pdfExtensions = new Set(['pdf']);
const officeExtensions = new Set(['doc', 'docx', 'odt', 'rtf', 'xls', 'xlsx', 'ods', 'csv', 'ppt', 'pptx', 'odp']);
const acceptedExtensions = new Set([...imageExtensions, ...pdfExtensions, ...officeExtensions]);
const toolDetails = {
  convert: { label: 'Convert files', uploadTitle: 'Upload an image or PDF', accept: '.jpg,.jpeg,.png,.webp,.svg,.heic,.heif,.pdf', hint: 'Choose an output format. PDF pages export as images; multiple outputs download as a ZIP.' },
  compress: { label: 'Compress images', uploadTitle: 'Upload images to compress', accept: '.jpg,.jpeg,.png,.webp,.svg,.heic,.heif', hint: 'Choose a quality level to reduce file size. Lower values create smaller files.' },
  resize: { label: 'Resize images', uploadTitle: 'Upload images to resize', accept: '.jpg,.jpeg,.png,.webp,.svg,.heic,.heif', hint: 'Set one dimension to preserve proportions, or set both for your chosen fit.' },
  crop: { label: 'Crop images', uploadTitle: 'Upload images to crop', accept: '.jpg,.jpeg,.png,.webp,.svg,.heic,.heif', hint: 'Enter a final frame size. FileMind crops from the center.' },
  'pdf-merge': { label: 'Merge PDFs', uploadTitle: 'Upload PDFs to merge', accept: '.pdf', hint: 'Choose two or more PDFs. They will be combined in the order shown.', fixedOutput: 'pdf' },
  'pdf-split': { label: 'Split PDF', uploadTitle: 'Upload a PDF to split', accept: '.pdf', hint: 'Each PDF page is exported separately. Multi-page results download as a ZIP.', fixedOutput: 'pdf' },
  'pdf-extract': { label: 'Extract pages', uploadTitle: 'Upload a PDF to extract pages', accept: '.pdf', hint: 'Optionally set the first and last page to extract. Leave both blank for all pages.', fixedOutput: 'pdf' },
  'pdf-compress': { label: 'Compress PDFs', uploadTitle: 'Upload PDFs to compress', accept: '.pdf', hint: 'PDFs are optimized for a smaller file size. Batch results download as a ZIP.', fixedOutput: 'pdf' },
  'document-pdf': { label: 'Convert documents', uploadTitle: 'Upload documents to convert', accept: '.doc,.docx,.odt,.rtf,.xls,.xlsx,.ods,.csv,.ppt,.pptx,.odp', hint: 'Word, Excel, PowerPoint, OpenDocument, CSV, and RTF files convert to PDF.', fixedOutput: 'pdf' },
  ocr: { label: 'Extract text', uploadTitle: 'Upload an image or PDF for OCR', accept: '.jpg,.jpeg,.png,.webp,.svg,.heic,.heif,.pdf', hint: 'OCR reads English text from images or PDF pages and returns editable text files.', fixedOutput: 'txt' }
};

let queuedFiles = [];
let operation = null;

function extensionOf(file) { return file.name.split('.').pop().toLowerCase(); }
function isImage(file) { return imageExtensions.has(extensionOf(file)); }
function isPdf(file) { return pdfExtensions.has(extensionOf(file)); }
function isOffice(file) { return officeExtensions.has(extensionOf(file)); }
function isCompatibleWithOperation(file) {
  if (['compress', 'resize', 'crop'].includes(operation)) return isImage(file);
  if (['pdf-merge', 'pdf-split', 'pdf-extract', 'pdf-compress'].includes(operation)) return isPdf(file);
  if (operation === 'document-pdf') return isOffice(file);
  if (operation === 'ocr' || operation === 'convert') return isImage(file) || isPdf(file);
  return false;
}
function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function iconFor(file) {
  const ext = extensionOf(file);
  if (ext === 'pdf') return 'PDF';
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'DOC';
  if (['xls', 'xlsx', 'ods', 'csv'].includes(ext)) return 'SHEET';
  if (['ppt', 'pptx', 'odp'].includes(ext)) return 'SLIDE';
  if (ext === 'svg') return 'SVG';
  if (ext === 'heic' || ext === 'heif') return 'HEIC';
  return ext.toUpperCase();
}
function announce(message, type = 'info') {
  statusMessage.textContent = message;
  statusMessage.dataset.type = type;
  statusMessage.hidden = !message;
}
function eligibilityError() {
  if (!queuedFiles.length) return '';
  if (['compress', 'resize', 'crop'].includes(operation) && !queuedFiles.every(isImage)) return 'This image tool accepts image files only.';
  if (operation === 'pdf-merge' && (!queuedFiles.every(isPdf) || queuedFiles.length < 2)) return 'Choose at least two PDF files to merge.';
  if (['pdf-split', 'pdf-extract', 'pdf-compress'].includes(operation) && !queuedFiles.every(isPdf)) return 'This PDF tool accepts PDF files only.';
  if (operation === 'document-pdf' && !queuedFiles.every(isOffice)) return 'Document to PDF accepts Word, Excel, PowerPoint, OpenDocument, CSV, or RTF files only.';
  if (operation === 'ocr' && !queuedFiles.every((file) => isImage(file) || isPdf(file))) return 'OCR accepts PDF and image files only.';
  if (operation === 'convert' && !queuedFiles.every((file) => isImage(file) || isPdf(file))) return 'Choose “Document → PDF” for document files.';
  return '';
}
function validateFiles(files) {
  if (!operation) throw new Error('Choose an action before uploading files.');
  const current = [...queuedFiles];
  for (const file of files) {
    if (!acceptedExtensions.has(extensionOf(file))) throw new Error(`${file.name} is not a supported file type.`);
    if (!isCompatibleWithOperation(file)) throw new Error(`${file.name} is not compatible with ${toolDetails[operation].label.toLowerCase()}.`);
    if (file.size > MAX_SIZE) throw new Error(`${file.name} is larger than 25 MB.`);
    if (current.some((existing) => existing.name === file.name && existing.size === file.size)) continue;
    current.push(file);
  }
  if (current.length > MAX_FILES) throw new Error(`You can add up to ${MAX_FILES} files at once.`);
  return current;
}
function addSelectedFiles(files) {
  try {
    queuedFiles = validateFiles(files);
    renderQueue();
    announce('');
  } catch (error) { announce(error.message, 'error'); }
}
function renderQueue() {
  fileWorkspace.hidden = queuedFiles.length === 0;
  fileCount.textContent = `(${queuedFiles.length})`;
  if (!operation) return;
  convertButton.innerHTML = `${toolDetails[operation].label} <span aria-hidden="true">→</span>`;
  fileList.innerHTML = queuedFiles.map((file, index) => `
    <article class="file-row">
      <span class="file-type file-type-${extensionOf(file)}">${iconFor(file)}</span>
      <span class="file-meta"><b>${file.name}</b><small>${formatSize(file.size)} · Ready</small></span>
      <span class="file-ready"><i></i> Ready</span>
      <button class="remove-file" type="button" data-index="${index}" aria-label="Remove ${file.name}">×</button>
    </article>`).join('');
  updateSettings();
}
function updateSettings() {
  if (!operation) return;
  const detail = toolDetails[operation];
  const needsDimensions = ['resize', 'crop'].includes(operation);
  const usesQuality = operation === 'compress' || (operation === 'convert' && ['jpg', 'webp'].includes(outputFormat.value));
  const extractsPages = operation === 'pdf-extract';
  outputFormatField.hidden = Boolean(detail.fixedOutput);
  if (detail.fixedOutput) outputFormat.value = detail.fixedOutput === 'txt' ? 'png' : detail.fixedOutput;
  document.querySelector('.quality-field').hidden = !usesQuality;
  document.querySelectorAll('.dimension-field, .fit-field').forEach((field) => { field.hidden = !needsDimensions; });
  document.querySelector('.page-start-field').hidden = !extractsPages;
  document.querySelector('.page-end-field').hidden = !extractsPages;
  document.querySelector('.ocr-language-field').hidden = operation !== 'ocr';
  const pdfOption = outputFormat.querySelector('option[value="pdf"]');
  pdfOption.disabled = queuedFiles.some(isPdf) || operation !== 'convert';
  if (pdfOption.disabled && outputFormat.value === 'pdf') outputFormat.value = 'png';
  settingsHint.textContent = eligibilityError() || detail.hint;
  convertButton.disabled = Boolean(eligibilityError());
}
function setOperation(nextOperation) {
  operation = nextOperation;
  const detail = toolDetails[operation];
  actionOptions.forEach((option) => option.classList.toggle('is-active', option.dataset.operation === operation));
  fileInput.accept = detail.accept;
  uploadTitle.textContent = detail.uploadTitle;
  uploadHelp.textContent = `${detail.accept.replaceAll('.', '').replaceAll(',', ', ').toUpperCase()} · Up to 25 MB each`;
  selectedActionLabel.textContent = detail.label.toUpperCase();
  uploadPanel.hidden = false;
  if (operation !== 'convert' && outputFormat.value === 'pdf') outputFormat.value = 'png';
  renderQueue();
  uploadPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

chooseFiles.addEventListener('click', () => fileInput.click());
addFiles.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('click', (event) => { if (event.target.closest('button')) return; fileInput.click(); });
dropZone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.click(); } });
fileInput.addEventListener('change', () => { addSelectedFiles([...fileInput.files]); fileInput.value = ''; });
['dragenter', 'dragover'].forEach((eventName) => dropZone.addEventListener(eventName, (event) => { event.preventDefault(); dropZone.classList.add('is-dragging'); }));
['dragleave', 'drop'].forEach((eventName) => dropZone.addEventListener(eventName, (event) => { event.preventDefault(); dropZone.classList.remove('is-dragging'); }));
dropZone.addEventListener('drop', (event) => addSelectedFiles([...event.dataTransfer.files]));
clearFiles.addEventListener('click', () => { queuedFiles = []; renderQueue(); announce(''); });
changeAction.addEventListener('click', () => actionPicker.scrollIntoView({ behavior: 'smooth', block: 'start' }));
fileList.addEventListener('click', (event) => { const button = event.target.closest('.remove-file'); if (!button) return; queuedFiles.splice(Number(button.dataset.index), 1); renderQueue(); });
actionOptions.forEach((option) => option.addEventListener('click', () => setOperation(option.dataset.operation)));
quality.addEventListener('input', () => { qualityValue.textContent = quality.value; });
outputFormat.addEventListener('change', updateSettings);

convertForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!operation) { announce('Choose an action before uploading files.', 'error'); return; }
  if (!queuedFiles.length) { announce('Choose one or more files first.', 'error'); return; }
  const sourceError = eligibilityError();
  if (sourceError) { announce(sourceError, 'error'); return; }
  if ((operation === 'resize' || operation === 'crop') && !widthInput.value && !heightInput.value) { announce('Add a width or height before converting.', 'error'); return; }
  if (operation === 'pdf-extract' && pageEndInput.value && !pageStartInput.value) { announce('Add the first page when choosing a last page.', 'error'); return; }

  const formData = new FormData();
  queuedFiles.forEach((file) => formData.append('files', file));
  formData.append('outputFormat', outputFormat.value);
  formData.append('operation', operation);
  formData.append('quality', quality.value);
  formData.append('width', widthInput.value);
  formData.append('height', heightInput.value);
  formData.append('fit', fitInput.value);
  formData.append('pageStart', pageStartInput.value);
  formData.append('pageEnd', pageEndInput.value);
  formData.append('ocrLanguage', ocrLanguageInput.value);
  convertButton.disabled = true;
  convertButton.innerHTML = '<span class="spinner" aria-hidden="true"></span> Processing…';
  announce('Processing your files privately on the server. Your download will start shortly.', 'info');
  try {
    const response = await fetch('/api/convert', { method: 'POST', body: formData });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'The conversion could not be completed.');
    }
    const blob = await response.blob();
    const attachment = response.headers.get('content-disposition') || '';
    const filename = attachment.match(/filename="?([^";]+)"?/i)?.[1] || 'filemind-download';
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    announce('Done — your download has started.');
  } catch (error) { announce(error.message, 'error'); }
  finally { convertButton.disabled = false; renderQueue(); }
});
