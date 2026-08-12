import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `site.titleSeparator` in nuxt.config drives a global titleTemplate that
 * appends ` · skilld` to every page title. Three pages appended it themselves
 * as well and shipped "Cloudflare skills · skilld · skilld" to production for
 * an unknown period, because a duplicated suffix is invisible unless someone
 * reads the rendered HTML: the page looks correct in the browser tab's
 * truncated view and no test asserted on it.
 */

const PAGE_ROOTS = ['app/pages', 'layers/marketing/app/pages', 'layers/registry/app/pages', 'layers/identity/app/pages']

function vueFiles(dir: string): string[] {
  let out: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  }
  catch {
    return out
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory())
      out = out.concat(vueFiles(full))
    else if (entry.endsWith('.vue'))
      out.push(full)
  }
  return out
}

describe('title template suffix', () => {
  it('never appends the site name a page already gets from titleTemplate', () => {
    const offenders: string[] = []

    for (const root of PAGE_ROOTS) {
      for (const file of vueFiles(root)) {
        const source = readFileSync(file, 'utf8')
        // A page may opt out of the global template and own its whole title.
        // The homepage does exactly that, so its ` · skilld` is correct.
        if (/titleTemplate:\s*null/.test(source))
          continue
        // Only title assignments matter; a `· skilld` inside body copy is fine.
        for (const line of source.split('\n')) {
          if (!/\btitle\s*:/.test(line) && !/const title\s*=/.test(line))
            continue
          if (line.includes('· skilld'))
            offenders.push(`${file}: ${line.trim()}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
