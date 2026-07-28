const OG_IMAGE_PLUGINS = new Map([
  ['og-image-canonical-urls.server.js', 'ogImageCanonicalUrls'],
  ['route-rule-og-image.server.js', 'routeRuleOgImage'],
])

const NUXT_PAGE_PLUGIN = '/nuxt/dist/pages/runtime/plugins/check-if-page-unused.js'

export function transformDependencyPlugin(id: string, code: string): string | null {
  const sourcePath = id.split('?')[0]!.replaceAll('\\', '/')
  const fileName = sourcePath.split('/').at(-1)
  const ogImageExport = fileName && sourcePath.includes('/nuxt-og-image/dist/runtime/app/plugins/')
    ? OG_IMAGE_PLUGINS.get(fileName)
    : undefined

  if (ogImageExport) {
    return [
      `import { defineNuxtPlugin } from '#app'`,
      `import { ${ogImageExport} } from '../utils/plugins.js'`,
      `export default defineNuxtPlugin(${ogImageExport})`,
    ].join('\n')
  }

  if (!sourcePath.endsWith(NUXT_PAGE_PLUGIN))
    return null

  const transformed = code.replace(
    /export\s*\{\s*NESTED_PAGE_CONFIRMATION_DELAY,\s*plugin as default,\s*findUnrenderedNestedPage\s*\};?/,
    'export default plugin;\nexport { NESTED_PAGE_CONFIRMATION_DELAY, findUnrenderedNestedPage };',
  )
  return transformed === code ? null : transformed
}

export function dependencyPluginCompat() {
  return {
    name: 'skilld:dependency-plugin-compat',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      return transformDependencyPlugin(id, code)
    },
  }
}
