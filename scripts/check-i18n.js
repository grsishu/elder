import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const localesDir = path.resolve(__dirname, '../client/src/locales');
const enPath = path.join(localesDir, 'en.json');
const hiPath = path.join(localesDir, 'hi.json');

console.log('[i18n check] Starting localization audit...');

if (!fs.existsSync(enPath) || !fs.existsSync(hiPath)) {
  console.error(`[i18n check] FAILED: Missing en.json or hi.json in ${localesDir}`);
  process.exit(1);
}

const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const hi = JSON.parse(fs.readFileSync(hiPath, 'utf8'));

function getFlattenedKeys(obj, prefix = '') {
  let keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys = keys.concat(getFlattenedKeys(v, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

const enKeys = new Set(getFlattenedKeys(en));
const hiKeys = new Set(getFlattenedKeys(hi));

let hasErrors = false;

// Check keys in EN missing in HI
const missingInHi = [];
for (const k of enKeys) {
  if (!hiKeys.has(k)) {
    missingInHi.push(k);
  }
}

// Check keys in HI missing in EN
const missingInEn = [];
for (const k of hiKeys) {
  if (!enKeys.has(k)) {
    missingInEn.push(k);
  }
}

if (missingInHi.length > 0) {
  console.error(`[i18n check] FAILED: ${missingInHi.length} keys exist in en.json but are MISSING in hi.json:`);
  missingInHi.slice(0, 15).forEach(k => console.error(`  - ${k}`));
  if (missingInHi.length > 15) console.error(`  ...and ${missingInHi.length - 15} more`);
  hasErrors = true;
}

if (missingInEn.length > 0) {
  console.error(`[i18n check] FAILED: ${missingInEn.length} keys exist in hi.json but are MISSING in en.json:`);
  missingInEn.slice(0, 15).forEach(k => console.error(`  - ${k}`));
  if (missingInEn.length > 15) console.error(`  ...and ${missingInEn.length - 15} more`);
  hasErrors = true;
}

// Check for empty string values
let emptyInEn = 0;
let emptyInHi = 0;
for (const k of enKeys) {
  const parts = k.split('.');
  let valEn = en;
  let valHi = hi;
  for (const p of parts) {
    valEn = valEn?.[p];
    valHi = valHi?.[p];
  }
  if (typeof valEn === 'string' && valEn.trim() === '') emptyInEn++;
  if (typeof valHi === 'string' && valHi.trim() === '') emptyInHi++;
}

if (emptyInEn > 0) {
  console.warn(`[i18n check] Warning: ${emptyInEn} empty strings found in en.json`);
}
if (emptyInHi > 0) {
  console.warn(`[i18n check] Warning: ${emptyInHi} empty strings found in hi.json`);
}

// Audit JSX files for hardcoded text outside t()
const srcDir = path.resolve(__dirname, '../client/src');
function scanDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'locales') {
        scanDir(fullPath);
      }
    } else if (entry.name.endsWith('.jsx') || entry.name.endsWith('.tsx')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      // Look for raw strings in JSX element tags like >Some English text< where it's not a variable or whitespace
      const hardcodedMatch = content.match(/>\s*([A-Za-z]{4,}\s+[A-Za-z]{3,}[^<{]*)\s*</g);
      if (hardcodedMatch) {
        console.warn(`[i18n audit] Note in ${path.relative(srcDir, fullPath)}: potential hardcoded string candidates:`);
        hardcodedMatch.slice(0, 3).forEach(m => console.warn(`   ${m.trim()}`));
      }
    }
  }
}

scanDir(srcDir);

if (hasErrors) {
  console.error('[i18n check] Audit FAILED with missing translation keys.');
  process.exit(1);
} else {
  console.log(`[i18n check] SUCCESS: All ${enKeys.size} keys match between English and Hindi.`);
  process.exit(0);
}
