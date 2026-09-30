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

const HEADING = /<h[1-6](?=[\s>])/g
const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'col', 'wbr'])

function isBalanced(html: string): boolean {
  const stack: string[] = []
  for (const match of html.matchAll(/<(\/?)([a-z][a-z0-9]*)\b[^>]*?(\/?)>/gi)) {
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

/**
 * The first section of the rendered SKILL.md: everything before the second
 * heading, or before the first when text leads. The API already renders the
 * body to HTML, so this cuts that HTML and never reads markdown. The result is
 * always balanced HTML, or null when nothing is left.
 */
export function excerptSkillHtml(html: string | null | undefined, maxChars = 1600): string | null {
  const source = html?.trim()
  if (!source)
    return null

  const headings = [...source.matchAll(HEADING)].map(m => m.index)
  // Text before any heading is the lead; otherwise the first heading opens the section.
  const cut = headings[0] === 0 ? headings[1] : headings[0]
  const section = (cut === undefined ? source : source.slice(0, cut)).trim()

  const candidates = [section]
  if (section.length > maxChars) {
    const window = section.slice(0, maxChars)
    const boundary = window.lastIndexOf('</p>')
    if (boundary > 0)
      candidates.unshift(window.slice(0, boundary + '</p>'.length))
    const firstBlock = section.indexOf('</p>')
    if (firstBlock > 0)
      candidates.push(section.slice(0, firstBlock + '</p>'.length))
  }
  const fits = candidates.find(c => c.length <= maxChars && isBalanced(c))
  return fits ?? null
}
