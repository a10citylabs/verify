import './style.css';
import './c2pa.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl from 'maplibre-gl';
import { createC2pa, type C2paSdk } from '@contentauth/c2pa-web';
import wasmSrc from '@contentauth/c2pa-web/resources/c2pa.wasm?url';
import c2paTrustList from './trust/C2PA-TRUST-LIST.pem?raw';
import c2paTsaTrustList from './trust/C2PA-TSA-TRUST-LIST.pem?raw';
import interimTrustAnchors from './trust/anchors.pem?raw';
import allowedCertHashes from './trust/allowed.sha256.txt?raw';
import trustStoreConfig from './trust/store.cfg?raw';

// DOM Elements
const dropZone = document.getElementById('drop-zone') as HTMLDivElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const previewCard = document.getElementById('preview-card') as HTMLDivElement;
const previewImage = document.getElementById('preview-image') as HTMLImageElement;
const previewVideo = document.getElementById('preview-video') as HTMLVideoElement;
const fileInfo = document.getElementById('file-info') as HTMLDivElement;
const loadingState = document.getElementById('loading-state') as HTMLDivElement;
const loadingText = document.getElementById('loading-text') as HTMLSpanElement;
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
let previewUrl: string | null = null;

const MP4_MIME_TYPES = ['video/mp4', 'application/mp4'];

// Determine the MIME type to hand to the C2PA reader. Some platforms
// leave file.type empty, so fall back to the file extension.
function resolveFormat(file: File): string {
  if (file.type) return file.type;
  if (/\.mp4$/i.test(file.name)) return 'video/mp4';
  return '';
}

function isMp4Format(format: string): boolean {
  return MP4_MIME_TYPES.includes(format);
}

function isVideoFormat(format: string): boolean {
  return format.startsWith('video/') || format === 'application/mp4';
}

// Initialize C2PA SDK
async function initC2pa(): Promise<void> {
  try {
    c2pa = await createC2pa({
      wasmSrc,
      settings: {
        trust: {
          // Official C2PA trust list + TSA list, plus the frozen interim
          // Content Credentials list for pre-2026 signers. See src/trust/README.md.
          trustAnchors: [c2paTrustList, c2paTsaTrustList, interimTrustAnchors].join('\n'),
          allowedList: allowedCertHashes,
          trustConfig: trustStoreConfig,
        },
        verify: { verifyTrust: true },
      },
    });
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

// Parse a GPS coordinate string to decimal degrees.
// Handles formats like "40,45.37050000N", "40 45 22.23", "40 45 22.23N"
function parseGpsCoord(value: string, ref: string): number | null {
  const trimmed = value.trim().replace(/[NSEW]$/, '');
  let decimal: number | null = null;

  if (trimmed.includes(',')) {
    // "degrees,decimal_minutes" format
    const parts = trimmed.split(',');
    if (parts.length >= 2) {
      const deg = parseFloat(parts[0]);
      const min = parseFloat(parts[1]);
      if (!isNaN(deg) && !isNaN(min)) {
        decimal = deg + min / 60;
      }
    }
  } else if (trimmed.includes(' ')) {
    // "degrees minutes seconds" space-separated
    const parts = trimmed.trim().split(/\s+/);
    if (parts.length === 3) {
      const deg = parseFloat(parts[0]);
      const min = parseFloat(parts[1]);
      const sec = parseFloat(parts[2]);
      if (!isNaN(deg) && !isNaN(min) && !isNaN(sec)) {
        decimal = deg + min / 60 + sec / 3600;
      }
    } else if (parts.length === 2) {
      const deg = parseFloat(parts[0]);
      const min = parseFloat(parts[1]);
      if (!isNaN(deg) && !isNaN(min)) {
        decimal = deg + min / 60;
      }
    }
  } else {
    decimal = parseFloat(trimmed);
    if (isNaN(decimal)) return null;
  }

  if (decimal === null) return null;
  return (ref === 'S' || ref === 'W') ? -decimal : decimal;
}

// Extract GPS coordinates from stds.exif assertion data
function extractGpsFromExif(assertions: unknown[]): { lat: number; lng: number } | null {
  for (const assertion of assertions) {
    const a = assertion as Record<string, unknown>;
    if (a.label === 'stds.exif' && a.data) {
      const data = a.data as Record<string, unknown>;
      const latStr = data['exif:GPSLatitude'] as string | undefined;
      const lngStr = data['exif:GPSLongitude'] as string | undefined;
      const latRef = (data['exif:GPSLatitudeRef'] as string | undefined) || 'N';
      const lngRef = (data['exif:GPSLongitudeRef'] as string | undefined) || 'E';

      if (latStr && lngStr) {
        const lat = parseGpsCoord(latStr, latRef);
        const lng = parseGpsCoord(lngStr, lngRef);
        if (lat !== null && lng !== null) {
          return { lat, lng };
        }
      }
    }
  }
  return null;
}

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
};

// Fetch nearby places of interest from Overpass API
async function fetchNearbyPlaces(lat: number, lng: number, radius = 500): Promise<OverpassElement[]> {
  const query = `[out:json][timeout:10];
(
  node["amenity"](around:${radius},${lat},${lng});
  node["tourism"](around:${radius},${lat},${lng});
  node["shop"]["name"](around:${radius},${lat},${lng});
  node["historic"](around:${radius},${lat},${lng});
);
out body 30;`;

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
    });
    if (!res.ok) throw new Error(`Overpass API returned ${res.status}`);
    const json = await res.json() as { elements: OverpassElement[] };
    return json.elements || [];
  } catch {
    return [];
  }
}

function poiIcon(tags: Record<string, string>): string {
  const amenity = tags.amenity || '';
  const tourism = tags.tourism || '';
  const historic = tags.historic || '';
  if (tourism === 'museum' || historic) return '🏛️';
  if (tourism === 'hotel' || amenity === 'hotel') return '🏨';
  if (amenity === 'restaurant') return '🍽️';
  if (amenity === 'cafe') return '☕';
  if (amenity === 'bar' || amenity === 'pub') return '🍺';
  if (tourism === 'attraction' || tourism === 'viewpoint') return '📍';
  if (amenity === 'bank' || amenity === 'atm') return '🏦';
  if (amenity === 'hospital' || amenity === 'clinic') return '🏥';
  if (amenity === 'pharmacy') return '💊';
  if (amenity === 'fuel') return '⛽';
  if (amenity === 'parking') return '🅿️';
  if (amenity === 'place_of_worship') return '⛪';
  if (amenity === 'school' || amenity === 'university') return '🎓';
  if (amenity === 'library') return '📚';
  if (amenity === 'theatre' || amenity === 'cinema') return '🎭';
  if (tags.shop) return '🛍️';
  return '📌';
}

// Render a MapLibre GL map with POIs into the given container element
async function renderLocationMap(lat: number, lng: number, container: HTMLElement): Promise<void> {
  const map = new maplibregl.Map({
    container,
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: [lng, lat],
    zoom: 14,
    attributionControl: {},
  });

  // Photo location marker
  const photoEl = document.createElement('div');
  photoEl.innerHTML = '📷';
  photoEl.style.cssText = 'font-size:28px;line-height:1;cursor:pointer;filter:drop-shadow(0 2px 4px rgba(0,0,0,.7))';
  new maplibregl.Marker({ element: photoEl, anchor: 'center' })
    .setLngLat([lng, lat])
    .setPopup(new maplibregl.Popup({ offset: 20 }).setHTML('<strong>📷 Photo Location</strong><br>Extracted from EXIF data'))
    .addTo(map);

  // Fetch and render POIs after map loads
  map.on('load', async () => {
    const places = await fetchNearbyPlaces(lat, lng);
    for (const place of places) {
      if (!place.lat || !place.lon || !place.tags) continue;
      const tags = place.tags;
      const name = tags.name || tags.amenity || tags.tourism || tags.shop || 'Place';
      const icon = poiIcon(tags);
      const category = tags.amenity || tags.tourism || tags.shop || tags.historic || '';

      const el = document.createElement('div');
      el.innerHTML = icon;
      el.style.cssText = 'font-size:20px;line-height:1;cursor:pointer;filter:drop-shadow(0 1px 3px rgba(0,0,0,.6))';

      new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([place.lon, place.lat])
        .setPopup(new maplibregl.Popup({ offset: 16 }).setHTML(
          `<strong>${escapeHtml(name)}</strong>${category ? `<br><small>${escapeHtml(category)}</small>` : ''}`
        ))
        .addTo(map);
    }
  });
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
function createCredentialDetails(manifestStore: unknown, verifyTimeMs?: number): void {
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
  const manifestJson = JSON.stringify(manifestStore);
  const manifestSizeBytes = new TextEncoder().encode(manifestJson).length;

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
        <div class="stat-item">
          <span class="stat-value">${formatFileSize(manifestSizeBytes)}</span>
          <span class="stat-label">Manifest Size</span>
        </div>
        ${verifyTimeMs !== undefined ? `
        <div class="stat-item">
          <span class="stat-value">${verifyTimeMs < 1000 ? verifyTimeMs.toFixed(0) + 'ms' : (verifyTimeMs / 1000).toFixed(2) + 's'}</span>
          <span class="stat-label">Verify Time</span>
        </div>
        ` : ''}
      </div>
    </div>
  `;
  
  // Location section placeholder (map rendered async after innerHTML set)
  const gpsCoords = assertions ? extractGpsFromExif(assertions) : null;
  let locationHtml = '';
  if (gpsCoords) {
    const { lat, lng } = gpsCoords;
    const latDir = lat >= 0 ? 'N' : 'S';
    const lngDir = lng >= 0 ? 'E' : 'W';
    locationHtml = `
      <div class="credential-section">
        <h3 class="section-title">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          Location
        </h3>
        <div class="section-content">
          <div class="credential-item">
            <span class="item-label">Coordinates</span>
            <span class="item-value">${Math.abs(lat).toFixed(6)}°${latDir}, ${Math.abs(lng).toFixed(6)}°${lngDir}</span>
          </div>
          <div id="exif-map-container" class="exif-map-container" aria-label="Map showing photo location"></div>
          <p class="map-attribution-note">Map tiles by <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> · Data © <a href="https://www.openstreetmap.org" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors. Places from <a href="https://overpass-api.de" target="_blank" rel="noopener noreferrer">Overpass API</a>.</p>
        </div>
      </div>
    `;
  }

  // Combine all sections - validation/issues at the end
  credentialDetails.innerHTML = signerHtml + contentHtml + processHtml + ingredientsHtml + locationHtml + statsHtml + validationHtml;

  // Render Leaflet map after DOM is updated
  if (gpsCoords) {
    const mapContainer = document.getElementById('exif-map-container');
    if (mapContainer) {
      renderLocationMap(gpsCoords.lat, gpsCoords.lng, mapContainer);
    }
  }
}

// Process uploaded file
async function processFile(file: File): Promise<void> {
  if (!c2pa) {
    showError('C2PA SDK is not initialized. Please refresh the page.');
    return;
  }
  
  const format = resolveFormat(file);
  const isVideo = isVideoFormat(format);

  // Update preview, swapping between the image and video elements
  previewCard.hidden = false;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  previewImage.hidden = isVideo;
  previewVideo.hidden = !isVideo;
  if (isVideo) {
    previewImage.removeAttribute('src');
    previewVideo.src = previewUrl;
  } else {
    previewVideo.pause();
    previewVideo.removeAttribute('src');
    previewImage.src = previewUrl;
  }
  fileInfo.textContent = `${file.name} • ${formatFileSize(file.size)} • ${format || 'unknown type'}`;

  // Show loading state
  loadingText.textContent = isVideo ? 'Analyzing video...' : 'Analyzing image...';
  showState('loading');

  try {
    // Create reader from blob
    const verifyStart = performance.now();
    const reader = await c2pa.reader.fromBlob(format, file);

    // Check if reader was created (no C2PA data found if null)
    if (!reader) {
      showState('no-data');
      return;
    }

    // Get manifest store
    const manifestStore = await reader.manifestStore();
    const verifyTimeMs = Math.round(performance.now() - verifyStart);

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
    createCredentialDetails(manifestStore, verifyTimeMs);
    
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
  if (file) {
    const format = resolveFormat(file);
    if (format.startsWith('image/') || isMp4Format(format)) {
      fileInput.files = e.dataTransfer.files;
      processFile(file);
    }
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
