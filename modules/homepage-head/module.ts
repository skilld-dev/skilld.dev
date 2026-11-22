import { join } from 'node:path'
import { addTypeTemplate, createResolver, defineNuxtModule } from '@nuxt/kit'

const stockPlugin = /[/\\]head[/\\]runtime[/\\]plugins[/\\]unhead(?:-stream)?\.client\.js$/
const assetName = /^(?:[\w.-]+\/)*[\w.-]+\.m?js$/
const assetsId = '#skilld-head-assets'

export default defineNuxtModule({
  meta: { name: 'skilld-homepage-head' },
  setup(_, nuxt) {
    if (nuxt.options.dev || process.env.NODE_ENV === 'test')
      return

    const { resolve } = createResolver(import.meta.url)
    const client = resolve('./runtime/head.client')
    const assets = { eager: '', runtime: '', options: '' }
    let eagerSource = ''

    nuxt.hook('app:resolve', (app) => {
      const head = app.plugins.find(plugin => stockPlugin.test(plugin.src))
      const scripts = app.plugins.find(plugin => plugin.src.endsWith('/modules/@nuxt-scripts/plugin.mjs'))
      if (!head || !scripts)
        throw new Error('Homepage head requires Nuxt head and the Cloudflare Analytics registry plugin.')

      // Cloudflare Analytics is the only registry entry. SSR emits its beacon once.
      scripts.mode = 'server'
      eagerSource = head.src.replaceAll('\\', '/')
      nuxt.options.alias['#skilld-eager-head'] = head.src
      nuxt.options.alias['#skilld-install-head'] = join(head.src, '../../install-client-head.js')
      head.src = client
    })

    nuxt.hook('build:manifest', (manifest) => {
      if (!eagerSource)
        throw new Error('Homepage head could not find the stock Nuxt client plugin.')

      for (const [key, chunk] of Object.entries(manifest)) {
        if (!assetName.test(chunk.file))
          continue
        // Rolldown can share the plugin options between the eager and lazy entries.
        if ([key, chunk.src, chunk.name].some(source => source?.includes('unhead-options'))) {
          assets.options = chunk.file
          continue
        }
        if (!chunk.isDynamicEntry)
          continue

        const sources = [key, chunk.src ?? ''].map(source => source.replaceAll('\\', '/').split('?')[0]!)
        if (sources.some(source => eagerSource.endsWith(`/${source.replace(/^(?:\.\.\/)+/, '')}`) || source === eagerSource)) {
          assets.eager = chunk.file
        }
        else if (sources.some(source => source.endsWith('/node_modules/unhead/dist/chunks/runtime.mjs'))) {
          assets.runtime = chunk.file
        }
        else {
          continue
        }

        chunk.preload = false
        chunk.prefetch = false
      }

      if (Object.values(assets).some(file => !file))
        throw new Error(`Homepage head is missing an emitted chunk: ${JSON.stringify(assets)}`)
    })

    addTypeTemplate({
      filename: 'types/skilld-head-assets.d.ts',
      getContents: () => `declare module '${assetsId}' {
        const assets: { eager: string, runtime: string, options: string }
        export default assets
      }`,
    }, { nuxt: false, nitro: true })

    nuxt.hook('nitro:config', (config) => {
      config.virtual ||= {}
      config.virtual[assetsId] = () => `export default ${JSON.stringify(assets)}`
      config.plugins ||= []
      config.plugins.push(resolve('./assets.server'))
    })
  },
})
