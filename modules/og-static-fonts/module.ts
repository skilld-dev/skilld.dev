import { join } from 'node:path'
import { defineNuxtModule, useLogger } from '@nuxt/kit'
import { syncOgStaticFonts } from './sync.ts'

/**
 * Fail the production build when an OG image font URL would answer 404.
 *
 * Without this, a cold-cache CI build shipped Plus Jakarta Sans and IBM Plex
 * Mono URLs with no files behind them, and every OG image fell back to Inter.
 */
export default defineNuxtModule({
  meta: { name: 'og-static-fonts' },
  setup(_options, nuxt) {
    if (nuxt.options.dev)
      return
    const logger = useLogger('og-static-fonts')
    nuxt.hook('nitro:init', (nitro) => {
      nitro.hooks.hook('compiled', () => {
        const result = syncOgStaticFonts({
          serverDir: nitro.options.output.serverDir,
          // Mirrors nuxt-og-image `getStaticFontCacheDir`, which it does not export.
          cacheDir: join(nuxt.options.buildDir, 'cache', 'og-image', 'static-fonts'),
          publicDir: nitro.options.output.publicDir,
          families: nuxt.options.fonts ? (nuxt.options.fonts.families ?? []).map(family => family.name) : [],
        })
        if (result._tag === 'Err') {
          const lines = ['OG image fonts are incomplete. The build stops so production keeps its brand fonts.']
          if (result.missingFiles.length > 0)
            lines.push(`The server fetches these files from /_og-static-fonts/, and the output has none of them: ${result.missingFiles.join(', ')}.`)
          if (result.missingFamilies.length > 0)
            lines.push(`nuxt-og-image resolved no font file for these families, so OG images would use Inter: ${result.missingFamilies.join(', ')}.`)
          lines.push('Check that the build can reach the font provider, then build again.')
          throw new Error(lines.join('\n'))
        }
        logger.info(`Verified ${result.referenced} OG image font files in the build output.`)
      })
    })
  },
})
