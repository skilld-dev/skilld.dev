import { skillInstallCmd, skillRunCmd } from '#shared/skill-commands'

/**
 * Data shaping for the experiment C template. Pure functions of data the Skill
 * API already returns. Delete with `skill-unique-value-experiment.ts`.
 */

export interface SkillFileEntry {
  path: string
  size: number
  type: 'markdown' | 'code' | 'image' | 'data' | 'other'
}

export type SkillFileFacts
  = | { _tag: 'only-skill-md' }
    | {
      _tag: 'has-files'
      /** Every file beside SKILL.md, as the sync counted them. */
      total: number
      markdown: number
      code: number
      other: number
      codePaths: string[]
      /** False when the API listed fewer files than the Skill holds. */
      complete: boolean
    }

export function resolveSkillFileFacts(input: { assets: readonly SkillFileEntry[], total: number }): SkillFileFacts {
  if (input.total === 0 && input.assets.length === 0)
    return { _tag: 'only-skill-md' }
  const codePaths = input.assets.filter(a => a.type === 'code').map(a => a.path)
  return {
    _tag: 'has-files',
    total: Math.max(input.total, input.assets.length),
    markdown: input.assets.filter(a => a.type === 'markdown').length,
    code: codePaths.length,
    other: input.assets.filter(a => a.type === 'other').length,
    codePaths,
    complete: input.assets.length >= input.total,
  }
}

export type SkillCommand
  = | { _tag: 'run', command: string }
    | { _tag: 'install', command: string, reason: string }

/**
 * A remote run prints SKILL.md and text files only. It never prints
 * executable or binary files, so a Skill that carries code, or carries files
 * the page cannot inspect, gets the install command and a reason. See
 * "Running is the default; installing is the opt-in" in `AGENTS.md`.
 */
export function resolveSkillCommand(
  skill: { owner: string, repo: string, name: string },
  files: SkillFileFacts,
): SkillCommand {
  const install = (reason: string): SkillCommand => ({
    _tag: 'install',
    command: skillInstallCmd(skill.owner, skill.repo, skill.name),
    reason,
  })
  if (files._tag === 'only-skill-md')
    return { _tag: 'run', command: skillRunCmd(skill.owner, skill.repo, skill.name) }
  if (files.code > 0 || files.other > 0)
    return install('This Skill ships code files. A remote run prints only text, so install it to use the code.')
  if (!files.complete)
    return install('This Skill ships more files than this page lists. A remote run cannot show they are all text, so install it.')
  return { _tag: 'run', command: skillRunCmd(skill.owner, skill.repo, skill.name) }
}

const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'col', 'wbr'])
const TAG = /<(\/?)([a-z][a-z0-9]*)\b[^>]*?(\/?)>/gi

function isBalanced(html: string): boolean {
  const stack: string[] = []
  for (const match of html.matchAll(TAG)) {
    const tag = match[2]!.toLowerCase()
    if (VOID_TAGS.has(tag) || match[3] === '/')
      continue
    if (match[1] === '/') {
      if (stack.pop() !== tag)
        return false
    }
    else {
      stack.push(tag)
    }
  }
  return stack.length === 0
}

/** Top-level blocks of rendered HTML. Malformed markup yields no blocks. */
function splitBlocks(html: string): string[] {
  const blocks: string[] = []
  let depth = 0
  let start = 0
  const push = (end: number): void => {
    const block = html.slice(start, end).trim()
    if (block)
      blocks.push(block)
    start = end
  }
  for (const match of html.matchAll(TAG)) {
    const tag = match[2]!.toLowerCase()
    const end = match.index + match[0].length
    if (VOID_TAGS.has(tag) || match[3] === '/') {
      if (depth === 0)
        push(end)
    }
    else if (match[1] === '/') {
      depth--
      if (depth < 0)
        return []
      if (depth === 0)
        push(end)
    }
    else {
      depth++
    }
  }
  if (depth !== 0)
    return []
  push(html.length)
  return blocks
}

function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Words a reader sees in rendered HTML. */
export function countHtmlWords(html: string): number {
  const text = textOf(html)
  return text ? text.split(' ').length : 0
}

const isHeading = (block: string): boolean => /^<h[1-6][\s>]/i.test(block)

/** A code fence stays only when it is short enough to read as part of the excerpt. */
const MAX_CODE_LINES = 12
const MAX_CODE_WORDS = 60

/** Cut one block down to whole sentences or list items within `budget` words, or null. */
function trimBlock(block: string, budget: number): string | null {
  const open = /^<(p|ul|ol)(?:\s[^>]*)?>/i.exec(block)
  if (!open)
    return null
  const tag = open[1]!.toLowerCase()
  const inner = block.slice(open[0].length, block.length - `</${tag}>`.length)
  if (tag === 'p') {
    const ends = [...inner.matchAll(/[.!?](?=\s|$)/g)].map(m => m.index + 1)
    for (const end of ends.reverse()) {
      const cut = inner.slice(0, end)
      if (countHtmlWords(cut) <= budget && isBalanced(cut))
        return `${open[0]}${cut}</p>`
    }
    return null
  }
  const items = splitBlocks(inner)
  const kept: string[] = []
  let used = 0
  for (const item of items) {
    const w = countHtmlWords(item)
    if (used + w > budget)
      break
    kept.push(item)
    used += w
  }
  return kept.length ? `${open[0]}\n${kept.join('\n')}\n</${tag}>` : null
}

export interface ExcerptOptions {
  /** The frontmatter description. A block that repeats it is dropped. */
  description?: string | null
  /** Upper bound on words. */
  maxWords?: number
  /** A first section with fewer body words pulls in the second one. */
  shortSectionWords?: number
}

/**
 * The opening of the rendered SKILL.md: the first section's blocks, plus the
 * second section when the first is short, capped near `maxWords`. The API
 * already renders the body to HTML, so this cuts that HTML and never reads
 * markdown. It cuts only at block boundaries, or at a sentence or list item
 * when one block alone exceeds the cap, so it never ends mid-sentence. It
 * returns balanced HTML, or null when no body text is left.
 */
export function excerptSkillHtml(html: string | null | undefined, options: ExcerptOptions = {}): string | null {
  const { description = null, maxWords = 250, shortSectionWords = 120 } = options
  const source = html?.trim()
  if (!source)
    return null

  const described = description ? textOf(description) : null
  const usable = splitBlocks(source).filter((block) => {
    if (described && !isHeading(block) && textOf(block) === described)
      return false
    if (/^<pre[\s>]/i.test(block))
      return block.split('\n').length <= MAX_CODE_LINES && countHtmlWords(block) <= MAX_CODE_WORDS
    return true
  })

  // Sections start at a heading. Text ahead of the first heading is its own section.
  const sections: string[][] = []
  for (const block of usable) {
    if (isHeading(block) || sections.length === 0)
      sections.push([block])
    else
      sections.at(-1)!.push(block)
  }
  const bodyWords = (section: string[]): number =>
    section.filter(b => !isHeading(b)).reduce((sum, b) => sum + countHtmlWords(b), 0)

  const chosen = [sections[0] ?? []]
  let next = 1
  while (bodyWords(chosen.flat()) < shortSectionWords && sections[next] && chosen.length < 2) {
    chosen.push(sections[next]!)
    next++
  }
  // A first section with no body pulls in following sections until one has text.
  while (bodyWords(chosen.flat()) === 0 && sections[next]) {
    chosen.push(sections[next]!)
    next++
  }

  const out: string[] = []
  let words = 0
  let bodyBlocks = 0
  for (const block of chosen.flat()) {
    const w = countHtmlWords(block)
    if (words + w <= maxWords) {
      out.push(block)
      words += w
      if (!isHeading(block))
        bodyBlocks++
      continue
    }
    if (isHeading(block))
      break
    const trimmed = trimBlock(block, maxWords - words)
    if (trimmed) {
      out.push(trimmed)
      bodyBlocks++
    }
    break
  }
  while (out.length && isHeading(out.at(-1)!))
    out.pop()
  return bodyBlocks > 0 ? out.join('\n') : null
}
