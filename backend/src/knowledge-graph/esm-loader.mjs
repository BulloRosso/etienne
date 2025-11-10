// ESM loader to dynamically import ES modules
export async function loadESModule(moduleName) {
  return await import(moduleName);
}
