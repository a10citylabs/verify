import './style.css';
import './c2pa.css';
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
const credentialDetails = document.getElementById('credential-details') as HTMLDivElement;
const jsonOutput = document.getElementById('json-output') as HTMLPreElement;
const copyBtn = document.getElementById('copy-btn') as HTMLButtonElement;

let c2pa: C2paSdk | null = null;
let currentJsonData: string = '';

// Initialize C2PA SDK
async function initC2pa(): Promise<void> {
  try {
    c2pa = await createC2pa({ wasmSrc });
    console.log('C2PA SDK initialized successfully');
    
    // Load default image after SDK is ready
    await loadDefaultImage();
  } catch (error) {
    console.error('Failed to initialize C2PA SDK:', error);
    showError('Failed to initialize C2PA SDK. Please refresh the page.');
  }
}

// Load default image on page load
async function loadDefaultImage(): Promise<void> {
  const defaultImagePath = 'https://raw.githubusercontent.com/a10citylabs/verify/main/img/butteryfly.jpg';
  
  try {
    const response = await fetch(defaultImagePath);
    if (!response.ok) {
      console.log('Default image not found, skipping auto-load');
      return;
    }
    
    const blob = await response.blob();
    const file = new File([blob], 'butteryfly.jpg', { type: blob.type || 'image/jpeg' });
    
    await processFile(file);
  } catch (error) {
    console.log('Could not load default image:', error);
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

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  } catch {
    return dateString;
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Map action codes to human-readable labels
function formatAction(action: string): string {
  const actionMap: Record<string, string> = {
    'c2pa.created': 'Created',
    'c2pa.opened': 'Opened',
    'c2pa.edited': 'Edited',
    'c2pa.converted': 'Converted',
    'c2pa.resized': 'Resized',
    'c2pa.cropped': 'Cropped',
    'c2pa.color_adjustments': 'Color Adjusted',
    'c2pa.filtered': 'Filtered',
    'c2pa.drawing': 'Drawing',
    'c2pa.placed': 'Placed',
    'c2pa.removed': 'Removed',
    'c2pa.repackaged': 'Repackaged',
    'c2pa.transcoded': 'Transcoded',
    'c2pa.unknown': 'Unknown Action',
  };
  
  return actionMap[action] || action.replace('c2pa.', '').replace(/_/g, ' ');
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

// Extract author information from assertions
function extractAuthor(assertions: unknown[]): string | null {
  for (const assertion of assertions) {
    const a = assertion as Record<string, unknown>;
    if (a.label === 'stds.schema-org.CreativeWork' && a.data) {
      const data = a.data as Record<string, unknown>;
      const author = data.author as Array<Record<string, unknown>> | undefined;
      if (author && author.length > 0) {
        const firstAuthor = author[0];
        if (firstAuthor.name) {
          return String(firstAuthor.name);
        }
      }
    }
  }
  return null;
}

// Extract actions from assertions
function extractActions(assertions: unknown[]): string[] {
  const actions: string[] = [];
  for (const assertion of assertions) {
    const a = assertion as Record<string, unknown>;
    if (a.label === 'c2pa.actions' && a.data) {
      const data = a.data as Record<string, unknown>;
      const actionList = data.actions as Array<Record<string, unknown>> | undefined;
      if (actionList) {
        for (const action of actionList) {
          if (action.action) {
            actions.push(String(action.action));
          }
        }
      }
    }
  }
  return actions;
}

// Create detailed credential display
function createCredentialDetails(manifestStore: unknown): void {
  credentialDetails.innerHTML = '';
  
  const store = manifestStore as Record<string, unknown>;
  
  // active_manifest is a string key that references the manifest in the manifests object
  const activeManifestKey = (store.active_manifest || store.activeManifest) as string | undefined;
  const manifests = store.manifests as Record<string, Record<string, unknown>> | undefined;
  
  // Get the actual manifest object using the key
  const activeManifest = activeManifestKey && manifests ? manifests[activeManifestKey] : undefined;
  
  if (!activeManifest) {
    credentialDetails.innerHTML = '<p class="no-details">No manifest details available.</p>';
    return;
  }
  
  // Validation Status Section
  const validationStatus = (store.validation_status || store.validationStatus) as unknown[] | undefined;
  const validationIssues = validationStatus?.filter((status: unknown) => {
    const s = status as Record<string, unknown>;
    return s.code && !String(s.code).startsWith('claim');
  }) || [];
  const hasErrors = validationIssues.length > 0;
  
  // Format validation code to be more readable
  const formatValidationCode = (code: string): string => {
    return code
      .replace(/\./g, ' › ')
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .replace(/^\w/, c => c.toUpperCase());
  };
  
  let validationIssuesHtml = '';
  if (hasErrors) {
    validationIssuesHtml = `
      <div class="validation-issues">
        ${validationIssues.map((issue: unknown) => {
          const i = issue as Record<string, unknown>;
          const code = i.code ? String(i.code) : 'Unknown issue';
          const explanation = i.explanation ? String(i.explanation) : '';
          return `
            <div class="validation-issue">
              <span class="issue-code">${escapeHtml(formatValidationCode(code))}</span>
              ${explanation ? `<span class="issue-explanation">${escapeHtml(explanation)}</span>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }
  
  const validationHtml = `
    <div class="credential-section validation-section ${hasErrors ? 'has-errors' : 'valid'}">
      <div class="validation-badge">
        ${hasErrors ? `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>${validationIssues.length} Issue${validationIssues.length !== 1 ? 's' : ''}</span>
        ` : `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <span>Content Credentials Verified</span>
        `}
      </div>
      ${validationIssuesHtml}
    </div>
  `;
  
  // Signer/Issuer Section
  const signatureInfo = (activeManifest.signature_info || activeManifest.signatureInfo) as Record<string, unknown> | undefined;
  let signerHtml = '';
  
  if (signatureInfo) {
    const issuer = signatureInfo.issuer ? String(signatureInfo.issuer) : 'Unknown Issuer';
    const signedAt = signatureInfo.time ? formatDate(String(signatureInfo.time)) : null;
    const certSerial = (signatureInfo.cert_serial_number || signatureInfo.certSerialNumber) ? String(signatureInfo.cert_serial_number || signatureInfo.certSerialNumber) : null;
    
    signerHtml = `
      <div class="credential-section">
        <h3 class="section-title">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          Signed By
        </h3>
        <div class="section-content">
          <div class="credential-item issuer-item">
            <span class="item-label">Issuer</span>
            <span class="item-value issuer-value">${escapeHtml(issuer)}</span>
          </div>
          ${signedAt ? `
          <div class="credential-item">
            <span class="item-label">Date Signed</span>
            <span class="item-value">${escapeHtml(signedAt)}</span>
          </div>
          ` : ''}
        </div>
      </div>
    `;
  }
  
  // Content Information Section
  const title = activeManifest.title ? String(activeManifest.title) : null;
  const format = activeManifest.format ? String(activeManifest.format) : null;
  const assertions = activeManifest.assertions as unknown[] | undefined;
  const author = assertions ? extractAuthor(assertions) : null;
  
  let contentHtml = '';
  if (title || format || author) {
    contentHtml = `
      <div class="credential-section">
        <h3 class="section-title">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          Content Information
        </h3>
        <div class="section-content">
          ${author ? `
          <div class="credential-item">
            <span class="item-label">Author</span>
            <span class="item-value author-value">${escapeHtml(author)}</span>
          </div>
          ` : ''}
          ${title ? `
          <div class="credential-item">
            <span class="item-label">Title</span>
            <span class="item-value">${escapeHtml(title)}</span>
          </div>
          ` : ''}
          ${format ? `
          <div class="credential-item">
            <span class="item-label">Format</span>
            <span class="item-value">${escapeHtml(format)}</span>
          </div>
          ` : ''}
        </div>
      </div>
    `;
  }
  
  // Process/Actions Section
  const claimGenerator = (activeManifest.claim_generator || activeManifest.claimGenerator) ? String(activeManifest.claim_generator || activeManifest.claimGenerator) : null;
  const actions = assertions ? extractActions(assertions) : [];
  
  let processHtml = '';
  if (claimGenerator || actions.length > 0) {
    // Parse claim generator to get app name
    let appName = claimGenerator;
    if (claimGenerator) {
      const parts = claimGenerator.split(' ');
      appName = parts[0].replace(/_/g, ' ').replace(/\//g, ' ');
    }
    
    processHtml = `
      <div class="credential-section">
        <h3 class="section-title">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          Process
        </h3>
        <div class="section-content">
          ${appName ? `
          <div class="credential-item">
            <span class="item-label">App/Device Used</span>
            <span class="item-value">${escapeHtml(appName)}</span>
          </div>
          ` : ''}
          ${actions.length > 0 ? `
          <div class="credential-item">
            <span class="item-label">Actions</span>
            <div class="actions-list">
              ${actions.map(action => `<span class="action-tag">${escapeHtml(formatAction(action))}</span>`).join('')}
            </div>
          </div>
          ` : ''}
        </div>
      </div>
    `;
  }
  
  // Ingredients Section
  const ingredients = activeManifest.ingredients as Array<Record<string, unknown>> | undefined;
  let ingredientsHtml = '';
  
  if (ingredients && ingredients.length > 0) {
    ingredientsHtml = `
      <div class="credential-section">
        <h3 class="section-title">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="8" y1="6" x2="21" y2="6"/>
            <line x1="8" y1="12" x2="21" y2="12"/>
            <line x1="8" y1="18" x2="21" y2="18"/>
            <line x1="3" y1="6" x2="3.01" y2="6"/>
            <line x1="3" y1="12" x2="3.01" y2="12"/>
            <line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
          Ingredients (${ingredients.length})
        </h3>
        <div class="section-content">
          <div class="ingredients-list">
            ${ingredients.map((ing, index) => {
              const ingTitle = ing.title ? String(ing.title) : `Ingredient ${index + 1}`;
              const ingFormat = ing.format ? String(ing.format) : '';
              return `
                <div class="ingredient-item">
                  <span class="ingredient-name">${escapeHtml(ingTitle)}</span>
                  ${ingFormat ? `<span class="ingredient-format">${escapeHtml(ingFormat)}</span>` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  }
  
  // Manifests Count
  const manifestCount = manifests ? Object.keys(manifests).length : 0;
  
  const statsHtml = `
    <div class="credential-section stats-section">
      <div class="stats-grid">
        <div class="stat-item">
          <span class="stat-value">${manifestCount}</span>
          <span class="stat-label">Manifest${manifestCount !== 1 ? 's' : ''}</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${assertions?.length || 0}</span>
          <span class="stat-label">Assertion${(assertions?.length || 0) !== 1 ? 's' : ''}</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${ingredients?.length || 0}</span>
          <span class="stat-label">Ingredient${(ingredients?.length || 0) !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  `;
  
  // Combine all sections - validation/issues at the end
  credentialDetails.innerHTML = signerHtml + contentHtml + processHtml + ingredientsHtml + statsHtml + validationHtml;
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
    
    if (!manifestStore) {
      showState('no-data');
      return;
    }
    
    // Check if there's an active manifest
    const storeData = manifestStore as Record<string, unknown>;
    const activeKey = (storeData.active_manifest || storeData.activeManifest) as string | undefined;
    const manifestsData = storeData.manifests as Record<string, unknown> | undefined;
    
    if (!activeKey || !manifestsData || !manifestsData[activeKey]) {
      showState('no-data');
      return;
    }
    
    // Create credential details display
    createCredentialDetails(manifestStore);
    
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