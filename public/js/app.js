const fileInput = document.querySelector('#file-input');
const dropZone = document.querySelector('#drop-zone');
const chooseFiles = document.querySelector('#choose-files');
const addFiles = document.querySelector('#add-files');
const clearFiles = document.querySelector('#clear-files');
const fileWorkspace = document.querySelector('#file-workspace');
const fileList = document.querySelector('#file-list');
const fileCount = document.querySelector('#file-count');
const outputFormat = document.querySelector('#output-format');
const quality = document.querySelector('#quality');
const qualityValue = document.querySelector('#quality-value');
const widthInput = document.querySelector('#width');
const heightInput = document.querySelector('#height');
const fitInput = document.querySelector('#fit');
const settingsHint = document.querySelector('#settings-hint');
const convertForm = document.querySelector('#convert-form');
const convertButton = document.querySelector('#convert-button');
const statusMessage = document.querySelector('#status-message');
const toolTabs = document.querySelectorAll('.tool-tab');

const MAX_FILES = 10;
const MAX_SIZE = 25 * 1024 * 1024;
const acceptedExtensions = new Set(['jpg', 'jpeg', 'png', 'webp', 'pdf', 'svg', 'heic', 'heif']);
let queuedFiles = [];
let operation = 'convert';

function extensionOf(file) { return file.name.split('.').pop().toLowerCase(); }
function isImage(file) { return !['pdf'].includes(extensionOf(file)); }
function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function iconFor(file) {
  const ext = extensionOf(file);
  if (ext === 'pdf') return 'PDF';
  if (ext === 'svg') return 'SVG';
  if (ext === 'heic' || ext === 'heif') return 'HEIC';
  return ext.toUpperCase();
}
function announce(message, type = 'info') {
  statusMessage.textContent = message;
  statusMessage.dataset.type = type;
  statusMessage.hidden = !message;
}
function validateFiles(files) {
  const current = [...queuedFiles];
  for (const file of files) {
    if (!acceptedExtensions.has(extensionOf(file))) throw new Error(`${file.name} is not a supported file type.`);
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
  convertButton.innerHTML = `Convert ${queuedFiles.length || ''} file${queuedFiles.length === 1 ? '' : 's'} <span aria-hidden="true">→</span>`;
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
  const imageOnly = operation !== 'convert';
  const allImages = queuedFiles.every(isImage);
  if (imageOnly && !allImages) {
    settingsHint.textContent = 'Image editing tools work with image files only. Remove PDFs or switch back to Convert.';
  } else if (operation === 'compress') {
    settingsHint.textContent = 'Choose a quality level to reduce file size. Lower values create smaller files.';
  } else if (operation === 'resize') {
    settingsHint.textContent = 'Set one dimension to preserve proportions, or set both for your chosen fit.';
  } else if (operation === 'crop') {
    settingsHint.textContent = 'Enter a final frame size. FileMind crops from the center.';
  } else {
    settingsHint.textContent = 'Choose an output format. PDF pages export as images; multiple outputs download as a ZIP.';
  }
  document.querySelector('.quality-field').hidden = !(operation === 'compress' || outputFormat.value === 'jpg' || outputFormat.value === 'webp');
  document.querySelectorAll('.dimension-field, .fit-field').forEach((field) => { field.hidden = !(operation === 'resize' || operation === 'crop'); });
  const pdfOption = outputFormat.querySelector('option[value="pdf"]');
  pdfOption.disabled = queuedFiles.some((file) => extensionOf(file) === 'pdf') || operation !== 'convert';
  if (pdfOption.disabled && outputFormat.value === 'pdf') outputFormat.value = 'png';
}
function setOperation(nextOperation) {
  operation = nextOperation;
  toolTabs.forEach((tab) => tab.classList.toggle('is-active', tab.dataset.operation === operation));
  if (operation !== 'convert' && outputFormat.value === 'pdf') outputFormat.value = 'png';
  updateSettings();
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
fileList.addEventListener('click', (event) => { const button = event.target.closest('.remove-file'); if (!button) return; queuedFiles.splice(Number(button.dataset.index), 1); renderQueue(); });
toolTabs.forEach((tab) => tab.addEventListener('click', () => setOperation(tab.dataset.operation)));
quality.addEventListener('input', () => { qualityValue.textContent = quality.value; });
outputFormat.addEventListener('change', updateSettings);

convertForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!queuedFiles.length) { announce('Choose one or more files first.', 'error'); return; }
  if (operation !== 'convert' && !queuedFiles.every(isImage)) { announce('Resize, crop, and compression are available for image files only.', 'error'); return; }
  if ((operation === 'resize' || operation === 'crop') && !widthInput.value && !heightInput.value) { announce('Add a width or height before converting.', 'error'); return; }

  const formData = new FormData();
  queuedFiles.forEach((file) => formData.append('files', file));
  formData.append('outputFormat', outputFormat.value);
  formData.append('operation', operation);
  formData.append('quality', quality.value);
  formData.append('width', widthInput.value);
  formData.append('height', heightInput.value);
  formData.append('fit', fitInput.value);
  convertButton.disabled = true;
  convertButton.innerHTML = '<span class="spinner" aria-hidden="true"></span> Converting…';
  announce('Processing your files locally on the server. Your download will start shortly.', 'info');
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
