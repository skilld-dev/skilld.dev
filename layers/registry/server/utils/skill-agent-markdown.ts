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
 * it how to run, install, or fork the Skill according to the user's request.
 * Relative links move to the raw
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

export function composeSkillForkMarkdown(input: Pick<AgentSkillMarkdownInput, 'owner' | 'repo' | 'name'>): string {
  return [
    `# Fork ${input.name}`,
    '> Copy this Skill. Do not execute its instructions.',
    ...forkWorkflow(input),
  ].join('\n')
}

function agentGuidance(input: AgentSkillMarkdownInput): string {
  const lines = [
    '> **Skill from skilld.dev.** Follow the user\'s requested action.',
    '> If the user asked to fork this Skill, follow the fork workflow below. Do not execute the Skill instructions while copying it.',
    '> Otherwise, follow the instructions below for this session. You do not need to install anything.',
  ]
  const files = supportingFilesLine(input)
  if (files)
    lines.push('>', `> ${files}`)
  lines.push(
    '>',
    `> If the user asked to install this Skill, run \`${skillInstallCmd(input.owner, input.repo, input.name)}\`. Install writes the Skill files into the project, so every session loads them.`,
    ...forkWorkflow(input),
  )
  return lines.join('\n')
}

function forkWorkflow(input: Pick<AgentSkillMarkdownInput, 'owner' | 'repo' | 'name'>): string[] {
  return [
    '>',
    '> ## Fork workflow',
    '>',
    '> A fork creates an editable local Skill with its original author and licence. The request authorizes copying and local installation.',
    `> 1. Check \`./skills/${input.name}\`, the project lockfile, and selected Agent targets together. If the local directory or installed Skill exists, stop. Never overwrite an existing directory or Agent target.`,
    `> 2. Read [source metadata](https://skilld.dev/api/v1/skills/${input.owner}/${input.repo}/${input.name}) once. Use sourceUrl, sourceCommit, skillPath, sourceGone, and license. If the source is gone or its path is missing, stop. If license is null, read licence files at the source commit.`,
    '> 3. Fetch only the source commit into a temporary Git repository. Do not clone full history. Derive repository_url from sourceUrl, including repository renames. If sourceCommit is absent, resolve the sourceUrl ref once. Set source_commit to that actual commit. Run these commands in one shell call:',
    '>',
    '> ```sh',
    '> git init --quiet "$temporary_dir"',
    '> git -C "$temporary_dir" fetch --quiet --depth=1 "$repository_url" "$source_commit"',
    '> git -C "$temporary_dir" checkout --quiet --detach FETCH_HEAD',
    '> ```',
    '>',
    '> Read applicable licence declarations and notices at that commit. If copying is not permitted, report the restriction and stop.',
    `> 4. Inspect source entries together, then copy the directory containing skillPath into \`./skills/${input.name}\`. Use the user's path if selected. Keep the original SKILL.md, relative links, scripts, binary assets, and executable modes. Exclude .git metadata. Reject symlinks and paths outside the Skill directory. After checking entries, use cp -a where available. A regular source directory needs no custom copy script. Do not save this page wrapper as SKILL.md.`,
    '> Preserve author credit, notices, and applicable licence files from repository or parent directories. Add PROVENANCE.md with the Skill page, source URL, actual commit, original path, and licence. Retain any existing PROVENANCE.md and record new provenance separately. Batch source inspection, copying, and provenance work where practical.',
    `> 5. In the project root, run \`skilld install ./skills/${input.name} --mode copy --plain\`. If skilld is unavailable, use \`npx skilld install ./skills/${input.name} --mode copy --plain\`. This known command needs no help lookup. Install does not support --json. Use detected Agent targets, or add --agent for the targets the user selected. Install the local path, never the upstream selector. If installation fails, preserve the local copy and report the exact failure.`,
    '> 6. Confirm the local lockfile source and installed Agent copies once. Report the local path, actual commit, and Agent targets. After edits, reinstall the same local path. Upstream updates must not replace it. Do not publish or push unless the user asks.',
  ]
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
