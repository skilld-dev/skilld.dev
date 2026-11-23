import MagicString from 'magic-string'

const OG_IMAGE_PLUGINS = new Map([
  ['og-image-canonical-urls.server.js', 'ogImageCanonicalUrls'],
  ['route-rule-og-image.server.js', 'routeRuleOgImage'],
])

const NUXT_PAGE_PLUGIN = '/nuxt/dist/pages/runtime/plugins/check-if-page-unused.js'

export function transformDependencyPlugin(id: string, code: string) {
  const sourcePath = id.split('?')[0]!.replaceAll('\\', '/')
  const fileName = sourcePath.split('/').at(-1)
  const ogImageExport = fileName && sourcePath.includes('/nuxt-og-image/dist/runtime/app/plugins/')
    ? OG_IMAGE_PLUGINS.get(fileName)
    : undefined

  const transformed = new MagicString(code)
  if (ogImageExport) {
    transformed.overwrite(0, code.length, [
      `import { defineNuxtPlugin } from '#app'`,
      `import { ${ogImageExport} } from '../utils/plugins.js'`,
      `export default defineNuxtPlugin(${ogImageExport})`,
    ].join('\n'))
  }
  else if (sourcePath.endsWith(NUXT_PAGE_PLUGIN)) {
    transformed.replace(
      /export\s*\{\s*NESTED_PAGE_CONFIRMATION_DELAY,\s*plugin as default,\s*findUnrenderedNestedPage\s*\};?/,
      'export default plugin;\nexport { NESTED_PAGE_CONFIRMATION_DELAY, findUnrenderedNestedPage };',
    )
  }
  else {
    return null
  }

  if (transformed.toString() === code)
    return null

  return {
    code: transformed.toString(),
    map: transformed.generateMap({ source: id, includeContent: true, hires: true }),
  }
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
