#!/usr/bin/env node
/**
 * Fetches the current C2PA trust lists into src/trust/.
 *
 * Sources:
 *  - Official C2PA trust list and TSA trust list, published by the C2PA
 *    conformance program: https://github.com/c2pa-org/conformance-public
 *  - Interim Content Credentials trust list (frozen 2026-01-01, kept to
 *    validate credentials signed before the official list existed):
 *    https://contentcredentials.org/trust/
 *
 * Usage: npm run update-trust-list
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'trust'
);

const CONFORMANCE_BASE =
  'https://raw.githubusercontent.com/c2pa-org/conformance-public/main/trust-list';
const INTERIM_BASE = 'https://contentcredentials.org/trust';

const SOURCES = [
  { file: 'C2PA-TRUST-LIST.pem', url: `${CONFORMANCE_BASE}/C2PA-TRUST-LIST.pem`, validate: validatePem },
  { file: 'C2PA-TSA-TRUST-LIST.pem', url: `${CONFORMANCE_BASE}/C2PA-TSA-TRUST-LIST.pem`, validate: validatePem },
  { file: 'anchors.pem', url: `${INTERIM_BASE}/anchors.pem`, validate: validatePem },
  { file: 'allowed.sha256.txt', url: `${INTERIM_BASE}/allowed.sha256.txt`, validate: validateHashList },
  { file: 'store.cfg', url: `${INTERIM_BASE}/store.cfg`, validate: validateStoreConfig },
];

function validatePem(text) {
  const certs = text.match(/-----BEGIN CERTIFICATE-----/g)?.length ?? 0;
  if (certs === 0) throw new Error('no PEM certificate blocks found');
  return `${certs} certificates`;
}

function validateHashList(text) {
  const hashes = text
    .split('\n')
    .filter((line) => /^[A-Za-z0-9+/]{43}=$/.test(line.trim()));
  if (hashes.length === 0) throw new Error('no base64 SHA-256 entries found');
  return `${hashes.length} certificate hashes`;
}

function validateStoreConfig(text) {
  const oids = text
    .split('\n')
    .filter((line) => /^\d+(\.\d+)+\s*$/.test(line.trim()));
  if (oids.length === 0) throw new Error('no EKU OIDs found');
  return `${oids.length} EKU OIDs`;
}

await mkdir(outDir, { recursive: true });

let failed = false;
for (const { file, url, validate } of SOURCES) {
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const summary = validate(text);
    await writeFile(path.join(outDir, file), text);
    console.log(`✓ ${file}: ${summary} (${text.length} bytes)`);
  } catch (error) {
    failed = true;
    console.error(`✗ ${file} (${url}): ${error.message}`);
  }
}

if (failed) {
  console.error('\nSome trust list files could not be updated; existing files were left untouched.');
  process.exit(1);
}

console.log('\nTrust lists updated. Review the diff, then commit src/trust/.');
