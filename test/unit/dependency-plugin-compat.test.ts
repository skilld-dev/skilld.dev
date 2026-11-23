import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping'
import { describe, expect, it } from 'vitest'
import { dependencyPluginCompat } from '../../scripts/lib/dependency-plugin-compat'

function transform(id: string, code: string) {
  const result = dependencyPluginCompat().transform(code, id)
  if (!result || typeof result === 'string')
    throw new Error('Expected transformed code with a source map')
  return result
}

describe('dependency plugin compatibility transform', () => {
  it.each([
    ['og-image-canonical-urls.server.js', 'ogImageCanonicalUrls'],
    ['route-rule-og-image.server.js', 'routeRuleOgImage'],
  ])('maps the %s wrapper to its original module', (file, exportName) => {
    const id = `/node_modules/nuxt-og-image/dist/runtime/app/plugins/${file}?v=123`
    const source = `export { ${exportName} as default } from "../utils/plugins.js";`
    const result = transform(id, source)
    const map = new TraceMap(result.map.toString())

    expect(result.code).toContain(`import { ${exportName} } from '../utils/plugins.js'`)
    expect(result.code).toContain(`export default defineNuxtPlugin(${exportName})`)
    expect(originalPositionFor(map, { line: 3, column: 0 })).toMatchObject({ source: id, line: 1, column: 0 })
    expect(map.sourcesContent).toEqual([source])
  })

  it('keeps original positions before and after the page export rewrite', () => {
    const id = 'C:\\node_modules\\nuxt\\dist\\pages\\runtime\\plugins\\check-if-page-unused.js?vue'
    const source = [
      'const plugin = defineNuxtPlugin({});',
      'export { NESTED_PAGE_CONFIRMATION_DELAY, plugin as default, findUnrenderedNestedPage };',
      'console.log(plugin);',
    ].join('\n')
    const result = transform(id, source)
    const map = new TraceMap(result.map.toString())
    const sourceId = id.replaceAll('\\', '/')

    expect(result.code).toContain('export default plugin;')
    expect(result.code).not.toContain('plugin as default')
    expect(originalPositionFor(map, { line: 1, column: 6 })).toMatchObject({ source: sourceId, line: 1, column: 6 })
    expect(originalPositionFor(map, { line: 2, column: 0 })).toMatchObject({ source: sourceId, line: 2, column: 0 })
    expect(originalPositionFor(map, { line: 4, column: 12 })).toMatchObject({ source: sourceId, line: 3, column: 12 })
    expect(map.sourcesContent).toEqual([source])
  })

  it.each([
    ['/app/plugins/analytics.ts', 'export default {}'],
    ['/node_modules/nuxt/dist/pages/runtime/plugins/check-if-page-unused.js', 'export default plugin;'],
  ])('leaves unchanged modules alone: %s', (id, source) => {
    expect(dependencyPluginCompat().transform(source, id)).toBeNull()
  })
})
