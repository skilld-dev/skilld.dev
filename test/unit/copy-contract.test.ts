// @vitest-environment node

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

function readRootFile(name: string) {
  return readFileSync(join(repoRoot, name), 'utf8')
}

function scopeTerms() {
  const frontmatter = readRootFile('COPY.md').match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const scopeLine = frontmatter?.[1]
    .split('\n')
    .find(line => line.startsWith('scope:'))
  if (!scopeLine)
    throw new Error('COPY.md frontmatter has no scope line')
  return scopeLine
    .slice('scope:'.length)
    .split(':')
    .at(-1)!
    .split(',')
    .map(term => term.trim())
    .filter(Boolean)
}

function rootMarkdownNames() {
  return readdirSync(repoRoot).filter(name => name.endsWith('.md'))
}

function leadingWords(text: string, count: number) {
  return text
    .toLowerCase()
    .replace(/[`*_"'.,:;!?()[\]]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, count)
    .join(' ')
}

function proseParagraphs(markdown: string) {
  return markdown
    .replace(/^---\n[\s\S]*?\n---/, '')
    .split(/\n\s*\n/)
    .map(block => block.split(/\n/).map(line => line.trim()).filter(Boolean).join(' '))
    .filter(Boolean)
    .filter(block => !block.startsWith('#') && !block.startsWith('|') && !block.startsWith('-') && !block.startsWith('>') && !/^\d+\./.test(block))
}

function normalizeCopy(value: string) {
  return value
    .toLowerCase()
    .replace(/[`*_"'.,:;!?()[\]·—–-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tableRows(section: string) {
  return section
    .split('\n')
    .filter(line => line.startsWith('|'))
    .slice(2)
    .map(row => row.split('|').map(cell => cell.trim()))
}

function canonicalAssets() {
  const section = readRootFile('COPY.md').split('## Canonical assets')[1]?.split('\n## ')[0]
  if (!section)
    throw new Error('COPY.md has no Canonical assets section')
  return tableRows(section).map(cells => ({ asset: cells[1]!, value: cells[2]!, placement: cells[3]! }))
}

function indexSource() {
  return readFileSync(join(repoRoot, 'app/pages/index.vue'), 'utf8')
}

function heroH1Text() {
  const h1 = indexSource().match(/<h1[\s\S]*?<\/h1>/)?.[0]
  if (!h1)
    throw new Error('the index page has no hero H1')
  return h1
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\{\{[\s\S]*?\}\}/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function indexOgAltText() {
  const alt = indexSource().match(/defineOgImage\([\s\S]*?alt:\s*'([^']*)'/)?.[1]
  if (!alt)
    throw new Error('the index page defines no OG image alt')
  return alt
}

function placementProbes() {
  return [
    { match: 'og image alt', text: indexOgAltText() },
    { match: 'h1', text: heroH1Text() },
    { match: 'site description', text: readRootFile('nuxt.config.ts') },
  ]
}

function walkSurfaces(dir: string, extensions: string[], found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.nuxt')
      continue
    const path = join(dir, entry.name)
    if (entry.isDirectory())
      walkSurfaces(path, extensions, found)
    else if (extensions.some(extension => entry.name.endsWith(extension)))
      found.push(path)
  }
  return found
}

function shippedSurfaceText(file: string) {
  const source = readFileSync(file, 'utf8')
  if (file.endsWith('.md')) {
    return source
      .replace(/^---\n[\s\S]*?\n---/, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`[^`]*`/g, ' ')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  }
  const template = source.match(/<template>[\s\S]*<\/template>/)?.[0] ?? ''
  return template
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\{\{[\s\S]*?\}\}/g, ' ')
    .replace(/<(?:"[^"]*"|'[^']*'|[^>])*>/g, (tag) => {
      const shipped = tag.match(/\b(?:alt|aria-label|title|placeholder|label)="([^"]*)"/)
      return shipped ? ` ${shipped[1]} ` : ' '
    })
}

function shippedSurfaces() {
  const files = [
    ...walkSurfaces(join(repoRoot, 'app'), ['.vue']),
    ...walkSurfaces(join(repoRoot, 'layers'), ['.vue', '.md']),
  ]
  return files.map(file => ({ file, text: shippedSurfaceText(file) }))
}

function bannedLanguageTerms() {
  const section = readRootFile('COPY.md').split('## Banned language')[1]?.split('\n## ')[0]
  if (!section)
    throw new Error('COPY.md has no Banned language section')
  return tableRows(section)
    .map(cells => cells[1]!)
    .filter(Boolean)
    .flatMap(cell => cell.split(','))
    .map(term => term.replace(/`/g, '').trim())
    .filter(Boolean)
    .map((term) => {
      const open = term.lastIndexOf('(')
      return open > 0 && term.endsWith(')')
        ? { term: term.slice(0, open).trim(), qualifier: term.slice(open + 1, -1).trim() }
        : { term, qualifier: undefined }
    })
}

function recordedExceptions() {
  return proseParagraphs(readRootFile('COPY.md'))
    .filter(block => block.startsWith('**Exception'))
    .join('\n')
    .toLowerCase()
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

describe('copy contract', () => {
  it('names every live content surface in its scope', () => {
    const terms = scopeTerms()
    const surfaces = [
      { term: 'learn content', path: 'layers/marketing/content/learn' },
    ]
    for (const { term, path } of surfaces) {
      if (!existsSync(join(repoRoot, path)))
        continue
      expect(terms, `"${term}" ships at ${path} but the COPY.md scope line does not name it`).toContain(term)
    }
  })

  it('references no path outside the repository', () => {
    const offenders = rootMarkdownNames().flatMap((name) => {
      const content = readRootFile(name)
      return content.split('\n').flatMap((line, index) =>
        line.includes('~/') ? [`${name}:${index + 1} -> ${line.trim()}`] : [],
      )
    })
    expect(offenders, 'references to paths that exist only on a personal machine').toEqual([])
  })

  it('has no near-duplicate adjacent paragraphs', () => {
    const paragraphs = proseParagraphs(readRootFile('COPY.md'))
    const duplicates: string[] = []
    for (let i = 1; i < paragraphs.length; i++) {
      const previous = leadingWords(paragraphs[i - 1]!, 6)
      const current = leadingWords(paragraphs[i]!, 6)
      if (previous && previous === current)
        duplicates.push(`"${paragraphs[i - 1]}" / "${paragraphs[i]}"`)
    }
    expect(duplicates, 'adjacent paragraphs that repeat the same opening').toEqual([])
  })

  it('ships each canonical string at every placement its row names', () => {
    const probes = placementProbes()
    const offenders = canonicalAssets().flatMap(({ asset, value, placement }) =>
      placement.split(',').flatMap((fragment) => {
        const probe = probes.find(p => normalizeCopy(fragment).includes(p.match))
        if (!probe)
          return []
        if (normalizeCopy(probe.text).includes(normalizeCopy(value)))
          return []
        return [`${asset} claims "${fragment}" but "${value}" is not there`]
      }),
    )
    expect(offenders, 'canonical strings missing from a claimed placement').toEqual([])
  })

  it('ships no banned term without a recorded exception', () => {
    const exceptions = recordedExceptions()
    const offenders: string[] = []
    for (const { term, qualifier } of bannedLanguageTerms()) {
      // A qualifier scopes the ban to one sense, which a text scan cannot judge.
      if (qualifier)
        continue
      const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i')
      for (const surface of shippedSurfaces()) {
        if (pattern.test(surface.text) && !exceptions.includes(term.toLowerCase()))
          offenders.push(`"${term}" ships at ${surface.file} with no exception in COPY.md`)
      }
    }
    expect(offenders, 'banned terms shipped without a recorded exception').toEqual([])
  })
})
