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

function mdSurfaceText(source: string) {
  return source
    .replace(/^---\n[\s\S]*?\n---/, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
}

const bracketPairs: Record<string, string> = { '(': ')', '{': '}', '[': ']' }

function skipStringLiteral(code: string, start: number) {
  const quote = code[start]
  let index = start + 1
  while (index < code.length && code[index] !== quote) {
    if (code[index] === '\\') {
      index += 2
      continue
    }
    if (quote === '`' && code[index] === '$' && code[index + 1] === '{') {
      index = spanEnd(code, index + 1) + 1
      continue
    }
    index += 1
  }
  return Math.min(index + 1, code.length)
}

function spanEnd(code: string, openIndex: number) {
  const open = code[openIndex]
  const close = bracketPairs[open]
  if (!close)
    return openIndex
  const expected: string[] = [close]
  let index = openIndex + 1
  while (index < code.length) {
    const char = code[index]!
    if (char === '\'' || char === '"' || char === '`') {
      index = skipStringLiteral(code, index)
      continue
    }
    if (char === '/' && code[index + 1] === '/') {
      const newline = code.indexOf('\n', index)
      if (newline < 0)
        return code.length
      index = newline
      continue
    }
    if (char === '/' && code[index + 1] === '*') {
      const end = code.indexOf('*/', index + 2)
      if (end < 0)
        return code.length
      index = end + 2
      continue
    }
    if (char in bracketPairs) {
      expected.push(bracketPairs[char]!)
    }
    else if (char === expected[expected.length - 1]) {
      expected.pop()
      if (expected.length === 0)
        return index
    }
    index += 1
  }
  return code.length
}

function statementEnd(code: string, startIndex: number) {
  const expected: string[] = []
  let index = startIndex
  while (index < code.length) {
    const char = code[index]!
    if (char === '\'' || char === '"' || char === '`') {
      index = skipStringLiteral(code, index)
      continue
    }
    if (char === '/' && code[index + 1] === '/') {
      const newline = code.indexOf('\n', index)
      if (newline < 0)
        return code.length
      index = newline
      continue
    }
    if (char === '/' && code[index + 1] === '*') {
      const end = code.indexOf('*/', index + 2)
      if (end < 0)
        return code.length
      index = end + 2
      continue
    }
    if (char in bracketPairs)
      expected.push(bracketPairs[char]!)
    else if (expected.length > 0 && char === expected[expected.length - 1])
      expected.pop()
    else if (expected.length === 0 && (char === '\n' || char === ';'))
      return index
    index += 1
  }
  return code.length
}

function collectStrings(code: string) {
  const strings: string[] = []
  let index = 0
  while (index < code.length) {
    const char = code[index]!
    if (char === '\'' || char === '"' || char === '`') {
      const end = skipStringLiteral(code, index)
      const value = code.slice(index + 1, end - 1)
      // Routes, URLs and file paths are identifiers, not copy.
      if (!value.includes('/'))
        strings.push(value)
      index = end
      continue
    }
    if (char === '/' && code[index + 1] === '/') {
      const newline = code.indexOf('\n', index)
      if (newline < 0)
        break
      index = newline
      continue
    }
    if (char === '/' && code[index + 1] === '*') {
      const end = code.indexOf('*/', index + 2)
      if (end < 0)
        break
      index = end + 2
      continue
    }
    index += 1
  }
  return strings
}

const metaCallNames = ['useSeoMeta', 'useHead', 'defineOgImage']
const metaValueNames = ['title', 'description', 'ogTitle', 'ogDescription', 'twitterTitle', 'twitterDescription']

function scriptMetaStrings(script: string) {
  const spans: string[] = []
  for (const name of metaCallNames) {
    for (const match of script.matchAll(new RegExp(`\\b${name}\\s*\\(`, 'g'))) {
      const open = match.index + match[0].length - 1
      const end = spanEnd(script, open)
      if (end > open)
        spans.push(script.slice(open + 1, end))
    }
  }
  for (const name of metaValueNames) {
    for (const match of script.matchAll(new RegExp(`\\bconst\\s+${name}\\s*=`, 'g'))) {
      const start = match.index + match[0].length
      const end = statementEnd(script, start)
      if (end > start)
        spans.push(script.slice(start, end))
    }
  }
  return spans.flatMap(collectStrings).join(' ')
}

const rootConfigMetaBlocks = ['site', 'mcpServerCard', 'agentSkills', 'mcp']

function rootConfigMetaText() {
  const config = readRootFile('nuxt.config.ts')
  return rootConfigMetaBlocks.flatMap(name =>
    [...config.matchAll(new RegExp(`\\b${name}:\\s*\\{`, 'g'))].flatMap((match) => {
      const open = match.index + match[0].length - 1
      const end = spanEnd(config, open)
      return end > open ? collectStrings(config.slice(open + 1, end)) : []
    }),
  ).join(' ')
}

function vueSurfaceText(source: string) {
  const template = source.match(/<template>[\s\S]*<\/template>/)?.[0] ?? ''
  const templateText = template
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\{\{[\s\S]*?\}\}/g, ' ')
    .replace(/<(?:"[^"]*"|'[^']*'|[^>])*>/g, (tag) => {
      const shipped = tag.match(/\b(?:alt|aria-label|title|placeholder|label)="([^"]*)"/)
      return shipped ? ` ${shipped[1]} ` : ' '
    })
  const scriptText = [...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
    .map(match => scriptMetaStrings(match[1]!))
    .join(' ')
  return `${templateText} ${scriptText}`
}

function shippedSurfaceText(file: string) {
  const source = readFileSync(file, 'utf8')
  if (file.endsWith('.md'))
    return mdSurfaceText(source)
  return vueSurfaceText(source)
}

function shippedSurfaces() {
  const files = [
    ...walkSurfaces(join(repoRoot, 'app'), ['.vue']),
    ...walkSurfaces(join(repoRoot, 'layers'), ['.vue', '.md']),
  ]
  return [
    ...files.map(file => ({ file, text: shippedSurfaceText(file) })),
    { file: 'nuxt.config.ts', text: rootConfigMetaText() },
  ]
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

function bannedOffenders(surfaces: { file: string, text: string }[]) {
  const exceptions = recordedExceptions()
  const offenders: string[] = []
  for (const { term, qualifier } of bannedLanguageTerms()) {
    // A qualifier scopes the ban to one sense, which a text scan cannot judge.
    if (qualifier)
      continue
    const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i')
    for (const surface of surfaces) {
      if (pattern.test(surface.text) && !exceptions.includes(term.toLowerCase()))
        offenders.push(`"${term}" ships at ${surface.file} with no exception in COPY.md`)
    }
  }
  return offenders
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
    const offenders = canonicalAssets().flatMap(({ asset, value, placement }) => {
      // A row marked guidance-only carries no placement contract to check.
      if (placement.toLowerCase().includes('guidance only'))
        return []
      return placement.split(',').map(fragment => fragment.trim()).filter(Boolean).flatMap((fragment) => {
        const probe = probes.find(p => normalizeCopy(fragment).includes(p.match))
        if (!probe)
          return [`"${asset}" names "${fragment}" but no probe can check that placement`]
        if (normalizeCopy(probe.text).includes(normalizeCopy(value)))
          return []
        return [`${asset} claims "${fragment}" but "${value}" is not there`]
      })
    })
    expect(offenders, 'canonical strings missing from a claimed placement').toEqual([])
  })

  it('reports a banned term shipped in script-set meta copy', () => {
    const source = [
      '<template>',
      '  <p>placeholder</p>',
      '</template>',
      '<script setup lang="ts">',
      'const description = \'This registry will supercharge your agent workflow.\'',
      'useSeoMeta({ description })',
      '</script>',
    ].join('\n')
    const offenders = bannedOffenders([{ file: 'fixture.vue', text: vueSurfaceText(source) }])
    expect(offenders, 'a banned term in a meta description set in script must be reported').toContain('"supercharge" ships at fixture.vue with no exception in COPY.md')
  })

  it('ships no banned term without a recorded exception', () => {
    expect(bannedOffenders(shippedSurfaces()), 'banned terms shipped without a recorded exception').toEqual([])
  })
})
