import { defineNitroPlugin } from 'nitropack/runtime'
import { buildAssetsURL } from '#internal/nuxt/paths'
import assets from '#skilld-head-assets'

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('render:html', (html, { event, streaming }) => {
    const [path, query] = event.path.split('?', 2)
    const pilot = path === '/' && new URLSearchParams(query).get('head') === 'lazy'
    if (!streaming && pilot) {
      html.head.push(`<meta name="skilld-head-assets" content="${assets.runtime} ${assets.options}">`)
    }
    else {
      const href = buildAssetsURL(assets.eager).replaceAll('&', '&amp;').replaceAll('"', '&quot;')
      html.head.push(`<link rel="modulepreload" crossorigin href="${href}">`)
    }
  })
})
