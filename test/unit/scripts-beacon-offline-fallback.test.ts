// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

/**
 * Bundling a registry script downloads it at build time. When
 * static.cloudflareinsights.com is unreachable, that download threw and the
 * whole build failed (issue #208). The fix wires the module's
 * `assets.fallbackOnSrcOnBundleFail` option so a failed download serves the
 * remote URL at runtime instead of failing the build.
 */

// nuxt.config.ts relies on the `defineNuxtConfig` auto-global that only the
// Nuxt CLI provides. Unit tests import the file cold, so provide a
// pass-through first.
;

(globalThis as any).defineNuxtConfig ??= (config: unknown) => config

// The config turns `import.meta.url` into filesystem paths for two Nitro
// aliases. Vitest does not give that import a file scheme, so the real
// `fileURLToPath` rejects it. This test only reads the `scripts` key, so the
// alias values are irrelevant and the raw href is a fine stand-in.
vi.mock('node:url', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:url')>()
  return {
    ...actual,
    fileURLToPath: (url: URL | string) => {
      try {
        return actual.fileURLToPath(url)
      }
      catch {
        return typeof url === 'string' ? url : url.href
      }
    },
  }
})

const config = await import('../../nuxt.config') as {
  default: {
    scripts?: {
      assets?: {
        fallbackOnSrcOnBundleFail?: boolean
      }
    }
  }
}

describe('scripts beacon offline fallback', () => {
  it('serves the remote beacon when the build-time download fails', () => {
    expect(config.default.scripts?.assets?.fallbackOnSrcOnBundleFail).toBe(true)
  })
})
