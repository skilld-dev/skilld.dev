import { skillInstallCmd, skillRawUrl } from '#shared/skill-commands'

export interface SupportingFile {
  /** Path relative to the SKILL.md directory, as the sync recorded it. */
  path: string
}

export interface AgentSkillMarkdownInput {
  owner: string
  repo: string
  name: string
  /** Pristine SKILL.md, frontmatter included. */
  markdown: string
  supportingFiles: readonly SupportingFile[]
}

const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/
const FENCE_RE = /^\s*(?:```|~~~)/
// `[text](target)` and `![alt](target)`, with an optional `"title"`.
const LINK_RE = /(!?\[[^\]]*\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g
const LISTED_FILES_MAX = 20

/**
 * The SKILL.md an Agent receives when it fetches the Skill page.
 *
 * The page's copy button hands the developer `Use this Skill: <page url>`, so
 * the Agent arrives here with no other instruction. The guidance block tells
 * it the Skill is for this session, where the files beside SKILL.md live, and
 * that installing waits for the user to ask. Relative links move to the raw
 * endpoint because they would resolve below the page route and 404.
 */
export function composeAgentSkillMarkdown(input: AgentSkillMarkdownInput): string {
  const match = input.markdown.match(FRONTMATTER_RE)
  const frontmatter = match ? match[0].trimEnd() : ''
  const body = match
    ? input.markdown.slice(match[0].length).replace(/^\r?\n/, '')
    : input.markdown
  return [frontmatter, agentGuidance(input), rewriteRelativeLinks(body, input)]
    .filter(Boolean)
    .join('\n\n')
}

function agentGuidance(input: AgentSkillMarkdownInput): string {
  const lines = [
    '> **Skill from skilld.dev.** Follow the instructions below for this session. You do not need to install anything.',
  ]
  const files = supportingFilesLine(input)
  if (files)
    lines.push('>', `> ${files}`)
  lines.push(
    '>',
    `> If the user asked to install this Skill, run \`${skillInstallCmd(input.owner, input.repo, input.name)}\`. Install writes the Skill files into the project, so every session loads them.`,
  )
  return lines.join('\n')
}

function supportingFilesLine(input: AgentSkillMarkdownInput): string | null {
  const { owner, repo, name, supportingFiles } = input
  if (!supportingFiles.length)
    return null
  if (supportingFiles.length > LISTED_FILES_MAX)
    return `${supportingFiles.length} supporting files sit beside this SKILL.md. When the Skill refers to one, fetch ${skillRawUrl(owner, repo, name, 'PATH')} with PATH replaced.`
  const links = supportingFiles
    .map(file => `[${file.path}](${skillRawUrl(owner, repo, name, file.path)})`)
    .join(', ')
  return `Supporting files, fetch one when the Skill refers to it: ${links}.`
}

function rewriteRelativeLinks(body: string, input: AgentSkillMarkdownInput): string {
  let inFence = false
  return body
    .split('\n')
    .map((line) => {
      if (FENCE_RE.test(line)) {
        inFence = !inFence
        return line
      }
      if (inFence)
        return line
      return line.replace(LINK_RE, (whole, open: string, target: string, close: string) => {
        const file = relativeSkillFile(target)
        if (!file)
          return whole
        return `${open}${skillRawUrl(input.owner, input.repo, input.name, file.path)}${file.suffix}${close}`
      })
    })
    .join('\n')
}

/** A link target inside the Skill directory, or null for anything else. */
function relativeSkillFile(target: string): { path: string, suffix: string } | null {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(target))
    return null
  const suffixAt = target.search(/[?#]/)
  const path = suffixAt === -1 ? target : target.slice(0, suffixAt)
  const suffix = suffixAt === -1 ? '' : target.slice(suffixAt)
  const segments: string[] = []
  for (const segment of path.split('/')) {
    if (!segment || segment === '.')
      continue
    if (segment === '..') {
      // Above the Skill directory means outside the raw endpoint's reach.
      if (!segments.length)
        return null
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  if (!segments.length)
    return null
  return { path: segments.join('/'), suffix }
}
