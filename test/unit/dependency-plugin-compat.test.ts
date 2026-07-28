import { describe, expect, it } from 'vitest'
import { transformDependencyPlugin } from '../../scripts/lib/dependency-plugin-compat'

describe('dependency plugin compatibility transform', () => {
  it.each([
    ['og-image-canonical-urls.server.js', 'ogImageCanonicalUrls'],
    ['route-rule-og-image.server.js', 'routeRuleOgImage'],
  ])('wraps the %s re-export for Nuxt analysis', (file, exportName) => {
    const result = transformDependencyPlugin(
      `/node_modules/nuxt-og-image/dist/runtime/app/plugins/${file}`,
      `export { ${exportName} as default } from "../utils/plugins.js";`,
    )

    expect(result).toContain(`import { ${exportName} } from '../utils/plugins.js'`)
    expect(result).toContain(`export default defineNuxtPlugin(${exportName})`)
  })

  it('makes Nuxt page plugin default export explicit', () => {
    const result = transformDependencyPlugin(
      '/node_modules/nuxt/dist/pages/runtime/plugins/check-if-page-unused.js',
      'const plugin = defineNuxtPlugin({});\nexport { NESTED_PAGE_CONFIRMATION_DELAY, plugin as default, findUnrenderedNestedPage };',
    )

    expect(result).toContain('export default plugin')
    expect(result).not.toContain('plugin as default')
  })

  it('ignores unrelated modules', () => {
    expect(transformDependencyPlugin('/app/plugins/analytics.ts', 'export default {}')).toBeNull()
  })
})
