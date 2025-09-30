import { normalize, join } from 'path';

export function norm(p: string): string {
  return normalize(p);
}

export function safeRoot(base: string, project: string): string {
  const root = norm(join(base, project));
  const normalizedBase = norm(base);
  // Handle empty base (relative paths) or ensure proper prefix check
  if (normalizedBase && !root.startsWith(normalizedBase)) {
    throw new Error('Path traversal');
  }
  return root;
}
