/**
 * Validate that all t() calls in components resolve to existing keys in namespace files.
 *
 * Usage: node scripts/validate-i18n.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(__dirname, '..', 'frontend', 'src');
const I18N_DIR = path.resolve(__dirname, '..', 'frontend', 'public', 'i18n', 'en');

// Load all namespace files
const namespaces = {};
for (const f of fs.readdirSync(I18N_DIR)) {
  if (f.endsWith('.json')) {
    const ns = f.replace('.json', '');
    namespaces[ns] = JSON.parse(fs.readFileSync(path.join(I18N_DIR, f), 'utf-8'));
  }
}

let issues = 0;
let checked = 0;

// Find all component files with t() calls
function findFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(fullPath));
    } else if (/\.(jsx|tsx|js)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

for (const filePath of findFiles(SRC_DIR)) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const relPath = path.relative(SRC_DIR, filePath);

  // Extract useTranslation namespace list
  const nsMatch = content.match(/useTranslation\(\[([^\]]+)\]\)/);
  let componentNs = ['common']; // default
  if (nsMatch) {
    componentNs = nsMatch[1].replace(/['"]/g, '').split(',').map(s => s.trim());
  }

  // Find all t() calls with string literal keys
  // Match t('key'), t('key', ...), t("key"), t(`key`)
  const tCallRegex = /t\((['"`])([a-zA-Z][a-zA-Z0-9_.:-]+)\1/g;
  let match;
  while ((match = tCallRegex.exec(content)) !== null) {
    const fullKey = match[2];
    checked++;

    // Check if key uses namespace:key syntax
    const colonIdx = fullKey.indexOf(':');
    if (colonIdx > 0) {
      const ns = fullKey.substring(0, colonIdx);
      const key = fullKey.substring(colonIdx + 1);

      if (!namespaces[ns]) {
        // Check if it has a fallback value (second argument to t())
        const afterMatch = content.substring(match.index + match[0].length);
        const hasFallback = /^\s*,\s*['"]/.test(afterMatch) || /^\s*,\s*\{/.test(afterMatch);
        if (!hasFallback) {
          console.log(`  MISSING NAMESPACE: ${relPath}: t('${fullKey}') — namespace '${ns}' has no file`);
          issues++;
        }
        continue;
      }
      if (!(key in namespaces[ns])) {
        // Check fallback
        const afterMatch = content.substring(match.index + match[0].length);
        const hasFallback = /^\s*,\s*['"]/.test(afterMatch);
        if (!hasFallback) {
          console.log(`  MISSING KEY: ${relPath}: t('${fullKey}') — key '${key}' not in ${ns}.json`);
          issues++;
        }
      }
    } else {
      // No namespace prefix — resolves against defaultNS (common)
      if (!(fullKey in namespaces['common'])) {
        // Could be in any of the component's namespaces
        let found = false;
        for (const ns of componentNs) {
          if (namespaces[ns] && fullKey in namespaces[ns]) {
            found = true;
            break;
          }
        }
        if (!found) {
          // Check fallback
          const afterMatch = content.substring(match.index + match[0].length);
          const hasFallback = /^\s*,\s*['"]/.test(afterMatch);
          if (!hasFallback) {
            console.log(`  MISSING KEY: ${relPath}: t('${fullKey}') — not found in common.json or component namespaces [${componentNs.join(',')}]`);
            issues++;
          }
        }
      }
    }
  }
}

console.log(`\nValidation complete: ${checked} keys checked, ${issues} issue(s) found.`);
if (issues > 0) process.exit(1);
