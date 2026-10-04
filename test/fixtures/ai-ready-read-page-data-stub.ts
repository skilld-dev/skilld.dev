/**
 * Stand-in for the `#ai-ready-virtual/read-page-data.mjs` virtual the
 * nuxt-ai-ready module generates at build time. It only serves the prerender
 * database path, which tests never execute; it exists so the dynamic import
 * inside the module's dist files resolves in a plain node environment.
 */

export async function readPageDataFromFilesystem(): Promise<never> {
  throw new Error('#ai-ready-virtual/read-page-data.mjs stub: the prerender path is not available in tests')
}
