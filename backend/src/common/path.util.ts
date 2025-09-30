import { normalize, join } from 'path';

export function safeJoin(base: string, projectDir: string, ...segments: string[]) {
  const root = normalize(join(base, projectDir));
  const target = normalize(join(root, ...segments));
  if (!target.startsWith(root)) throw new Error('Path traversal blocked');
  return { root, target };
}

// NEW: build POSIX path for container working dir
export function posixProjectPath(containerRoot: string, projectDir: string, ...segments: string[]) {
  const root = containerRoot.replace(/\\/g, '/');          // e.g., "/workspace"
  const parts = [projectDir, ...segments]
    .map(s => s.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')) // strip win slashes + trim
    .filter(Boolean);
  const out = [root, ...parts].join('/');
  return out.replace(/\/{2,}/g, '/');                      // collapse //
}
