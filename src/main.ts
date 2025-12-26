import './style.css';
import { createC2pa, type C2paSdk } from '@contentauth/c2pa-web';
import wasmSrc from '@contentauth/c2pa-web/resources/c2pa.wasm?url';

// DOM Elements
const dropZone = document.getElementById('drop-zone') as HTMLDivElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const previewCard = document.getElementById('preview-card') as HTMLDivElement;
const previewImage = document.getElementById('preview-image') as HTMLImageElement;
const fileInfo = document.getElementById('file-info') as HTMLDivElement;
const loadingState = document.getElementById('loading-state') as HTMLDivElement;
const emptyState = document.getElementById('empty-state') as HTMLDivElement;
const noDataState = document.getElementById('no-data-state') as HTMLDivElement;
const errorState = document.getElementById('error-state') as HTMLDivElement;
const errorMessage = document.getElementById('error-message') as HTMLParagraphElement;
const resultsContainer = document.getElementById('results-container') as HTMLDivElement;
const summaryGrid = document.getElementById('summary-grid') as HTMLDivElement;
const jsonOutput = document.getElementById('json-output') as HTMLPreElement;
const copyBtn = document.getElementById('copy-btn') as HTMLButtonElement;

let c2pa: C2paSdk | null = null;
let currentJsonData: string = '';

// Initialize C2PA SDK
async function initC2pa(): Promise<void> {
  try {
    c2pa = await createC2pa({ wasmSrc });
    console.log('C2PA SDK initialized successfully');
  } catch (error) {
    console.error('Failed to initialize C2PA SDK:', error);
    showError('Failed to initialize C2PA SDK. Please refresh the page.');
  }
}

// UI State Management
function showState(state: 'empty' | 'loading' | 'no-data' | 'error' | 'results'): void {
  emptyState.hidden = state !== 'empty';
  loadingState.hidden = state !== 'loading';
  noDataState.hidden = state !== 'no-data';
  errorState.hidden = state !== 'error';
  resultsContainer.hidden = state !== 'results';
}

function showError(message: string): void {
  errorMessage.textContent = message;
  showState('error');
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Syntax highlighting for JSON
function syntaxHighlight(json: string): string {
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = 'json-number';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'json-key';
        } else {
          cls = 'json-string';
        }
      } else if (/true|false/.test(match)) {
        cls = 'json-boolean';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

// Create summary items from manifest store
function createSummary(manifestStore: unknown): void {
  summaryGrid.innerHTML = '';
  
  const store = manifestStore as Record<string, unknown>;
  const activeManifest = store.activeManifest as Record<string, unknown> | undefined;
  
  const summaryItems: Array<{ label: string; value: string }> = [];
  
  if (activeManifest) {
    // Claim generator
    if (activeManifest.claimGenerator) {
      summaryItems.push({
        label: 'Claim Generator',
        value: String(activeManifest.claimGenerator),
      });
    }
    
    // Title
    if (activeManifest.title) {
      summaryItems.push({
        label: 'Title',
        value: String(activeManifest.title),
      });
    }
    
    // Format
    if (activeManifest.format) {
      summaryItems.push({
        label: 'Format',
        value: String(activeManifest.format),
      });
    }
    
    // Signature info
    const signatureInfo = activeManifest.signatureInfo as Record<string, unknown> | undefined;
    if (signatureInfo) {
      if (signatureInfo.issuer) {
        summaryItems.push({
          label: 'Issuer',
          value: String(signatureInfo.issuer),
        });
      }
      if (signatureInfo.time) {
        summaryItems.push({
          label: 'Signed At',
          value: new Date(String(signatureInfo.time)).toLocaleString(),
        });
      }
    }
    
    // Assertions count
    const assertions = activeManifest.assertions as unknown[] | undefined;
    if (assertions && Array.isArray(assertions)) {
      summaryItems.push({
        label: 'Assertions',
        value: String(assertions.length),
      });
    }
    
    // Ingredients count
    const ingredients = activeManifest.ingredients as unknown[] | undefined;
    if (ingredients && Array.isArray(ingredients)) {
      summaryItems.push({
        label: 'Ingredients',
        value: String(ingredients.length),
      });
    }
  }
  
  // Manifests count
  const manifests = store.manifests as Record<string, unknown> | undefined;
  if (manifests) {
    summaryItems.push({
      label: 'Total Manifests',
      value: String(Object.keys(manifests).length),
    });
  }
  
  // Validation status
  const validationStatus = store.validationStatus as unknown[] | undefined;
  if (validationStatus) {
    const hasErrors = validationStatus.some((status: unknown) => {
      const s = status as Record<string, unknown>;
      return s.code && !String(s.code).startsWith('claim');
    });
    summaryItems.push({
      label: 'Validation',
      value: hasErrors ? '⚠️ Has Issues' : '✓ Valid',
    });
  }
  
  summaryItems.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'summary-item';
    div.innerHTML = `
      <div class="label">${item.label}</div>
      <div class="value">${item.value}</div>
    `;
    summaryGrid.appendChild(div);
  });
}

// Process uploaded file
async function processFile(file: File): Promise<void> {
  if (!c2pa) {
    showError('C2PA SDK is not initialized. Please refresh the page.');
    return;
  }
  
  // Update preview
  previewCard.hidden = false;
  previewImage.src = URL.createObjectURL(file);
  fileInfo.textContent = `${file.name} • ${formatFileSize(file.size)} • ${file.type}`;
  
  // Show loading state
  showState('loading');
  
  try {
    // Create reader from blob
    const reader = await c2pa.reader.fromBlob(file.type, file);
    
    // Check if reader was created (no C2PA data found if null)
    if (!reader) {
      showState('no-data');
      return;
    }
    
    // Get manifest store
    const manifestStore = await reader.manifestStore();
    
    // Free the reader to avoid memory leaks
    await reader.free();
    
    if (!manifestStore || (manifestStore as Record<string, unknown>).activeManifest === null) {
      showState('no-data');
      return;
    }
    
    // Create summary
    createSummary(manifestStore);
    
    // Display raw JSON
    currentJsonData = JSON.stringify(manifestStore, null, 2);
    const code = jsonOutput.querySelector('code');
    if (code) {
      code.innerHTML = syntaxHighlight(currentJsonData);
    }
    
    showState('results');
  } catch (error) {
    console.error('Error processing file:', error);
    
    // Check if it's a "no C2PA data" error
    const errorStr = String(error);
    if (errorStr.includes('No C2PA') || errorStr.includes('not found') || errorStr.includes('JumbfNotFound')) {
      showState('no-data');
    } else {
      showError(`Error processing file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Event Listeners
dropZone.addEventListener('click', () => {
  fileInput.click();
});

dropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) {
    processFile(file);
  }
});

// Drag and drop handlers
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  
  const file = e.dataTransfer?.files[0];
  if (file && file.type.startsWith('image/')) {
    fileInput.files = e.dataTransfer.files;
    processFile(file);
  }
});

// Copy button
copyBtn.addEventListener('click', async () => {
  if (!currentJsonData) return;
  
  try {
    await navigator.clipboard.writeText(currentJsonData);
    copyBtn.classList.add('copied');
    const span = copyBtn.querySelector('span');
    if (span) span.textContent = 'Copied!';
    
    setTimeout(() => {
      copyBtn.classList.remove('copied');
      if (span) span.textContent = 'Copy';
    }, 2000);
  } catch (error) {
    console.error('Failed to copy:', error);
  }
});

// Initialize
initC2pa();
