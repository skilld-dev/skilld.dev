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
})
