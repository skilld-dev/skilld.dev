/**
 * Stand-in for the `#nuxtseo/nitro` virtual the nuxt-ai-ready module injects
 * at build time. Tests that load the module's runtime dist files directly
 * (node environment, no Nuxt build) alias this specifier here and mock it
 * with `vi.mock`. Nothing in the suite imports the real functions, so every
 * export throws to fail loud if that ever changes.
 */

export function useRuntimeConfig(): never {
  throw new Error('#nuxtseo/nitro shim: useRuntimeConfig must be mocked')
}

export function useEvent(): never {
  throw new Error('#nuxtseo/nitro shim: useEvent must be mocked')
}

export function useNitroApp(): never {
  throw new Error('#nuxtseo/nitro shim: useNitroApp must be mocked')
}

export async function fetchWithEvent(
  _event: unknown,
  request: RequestInfo | URL,
  init?: RequestInit,
): Promise<unknown> {
  return globalThis.fetch(request, init)
}
