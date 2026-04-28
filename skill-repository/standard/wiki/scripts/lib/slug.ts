export function slugify(input: string): string {
  const s = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)) {
    throw new Error(`slugify produced invalid slug from "${input}": "${s}"`);
  }
  return s.slice(0, 80);
}
