// Ambient module declarations for image imports — Vite inlines these into
// the single-file bundle. Without this declaration, tsc errors on the
// `import x from "./foo.png"` syntax.
declare module "*.png" {
  const src: string;
  export default src;
}
declare module "*.jpg" {
  const src: string;
  export default src;
}
declare module "*.jpeg" {
  const src: string;
  export default src;
}
declare module "*.svg" {
  const src: string;
  export default src;
}
