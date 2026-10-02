import type { IconifyCollection } from '../../shared/file-icons'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { defineNuxtModule, useLogger } from '@nuxt/kit'
import { FILE_ICON_BASE_URL, FILE_ICON_NAMES, fileIconSvg } from '../../shared/file-icons'

/**
 * Write the Skill explorer's file-type icons as static SVG files.
 *
 * Every name in `FILE_ICON_NAMES` must render, or the build stops: a missing
 * file would show a broken image in every tree that lists that file type.
 */
export default defineNuxtModule({
  meta: { name: 'file-icons' },
  setup(_options, nuxt) {
    const logger = useLogger('file-icons')
    const require = createRequire(join(nuxt.options.rootDir, 'package.json'))
    const collection = JSON.parse(readFileSync(require.resolve('@iconify-json/vscode-icons/icons.json'), 'utf8')) as IconifyCollection

    // Outside `buildDir`, which the build clears after Nitro is configured and
    // before it copies public assets, so files written there never shipped.
    const dir = join(nuxt.options.rootDir, 'node_modules', '.cache', 'file-icons')
    mkdirSync(dir, { recursive: true })
    const failures: string[] = []
    for (const name of FILE_ICON_NAMES) {
      const result = fileIconSvg(collection, name)
      if (result._tag === 'Err')
        failures.push(result.reason)
      else
        writeFileSync(join(dir, `${name}.svg`), result.svg)
    }
    if (failures.length)
      throw new Error(`File icons could not be written, so Skill trees would show broken images: ${failures.join('; ')}.`)

    nuxt.options.nitro.publicAssets ||= []
    nuxt.options.nitro.publicAssets.push({ dir, baseURL: FILE_ICON_BASE_URL, maxAge: 60 * 60 * 24 * 7 })
    logger.info(`Wrote ${FILE_ICON_NAMES.length} file icons for ${FILE_ICON_BASE_URL}.`)
  },
})
