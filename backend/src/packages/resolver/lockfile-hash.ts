import * as crypto from 'crypto';
import * as fs from 'fs-extra';
import * as path from 'path';
import { PackageManifest } from '../dto/manifest.dto';

/**
 * Canonicalize a JS object by recursively sorting object keys, so that two
 * structurally-equal objects produce the same JSON string.
 *
 * This is the basis for reproducible manifest hashing — two manifests with
 * the same content but different key order must hash identically.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = canonicalize(obj[key]);
    }
    return out;
  }
  return value;
}

/**
 * sha256 hex of the canonical JSON form of `value`.
 */
export function hashCanonical(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

/**
 * Hash a package manifest. Used for the lockfile's `manifestHash` and as
 * an identity for caching resolve results in the future.
 */
export function hashManifest(manifest: PackageManifest): string {
  return hashCanonical(manifest);
}

/**
 * sha256 hex of the contents of a directory tree.
 *
 * Files are walked in stable (sorted, depth-first) order, and each file's
 * relative path + content are folded into a running hash. Symlinks and
 * dotfiles are included as-is — the resolver decides what to ignore by
 * passing a filtered sub-tree.
 */
export async function hashDirectory(dir: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  if (!(await fs.pathExists(dir))) {
    return hash.update('<missing>').digest('hex');
  }

  const walk = async (current: string, prefix: string): Promise<void> => {
    const entries = await fs.readdir(current, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      const relPath = path.posix.join(prefix, entry.name);
      if (entry.isDirectory()) {
        hash.update(`D ${relPath}\n`);
        await walk(fullPath, relPath);
      } else if (entry.isFile()) {
        const content = await fs.readFile(fullPath);
        hash.update(`F ${relPath} ${content.length}\n`);
        hash.update(content);
      }
      // Symlinks intentionally skipped — repos shouldn't ship them.
    }
  };

  await walk(dir, '');
  return hash.digest('hex');
}

/**
 * Extract unresolved placeholder tokens from an MCP server config block.
 *
 * Placeholders look like `${env:FOO}` or `${kv:bar}`. Returns deduplicated
 * tokens including the wrapping `${...}`. The resolver uses this to flag
 * unbound secrets as warnings.
 */
export function extractPlaceholders(value: unknown): string[] {
  const tokens = new Set<string>();
  const re = /\$\{[a-zA-Z0-9_:.\-]+\}/g;
  const walk = (v: unknown): void => {
    if (typeof v === 'string') {
      const matches = v.match(re);
      if (matches) for (const m of matches) tokens.add(m);
      return;
    }
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    if (v && typeof v === 'object') {
      Object.values(v as Record<string, unknown>).forEach(walk);
    }
  };
  walk(value);
  return [...tokens];
}
