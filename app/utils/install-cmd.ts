const PREFIX = 'npx skilld add'

export function gitInstallCmd(owner: string, repo: string, skill?: string): string {
  const base = `${PREFIX} gh:${owner}/${repo}`
  return skill ? `${base} -s ${skill}` : base
}

export function curatorInstallCmd(handle: string): string {
  return `${PREFIX} @${handle}`
}

export function collectionInstallCmd(handle: string, slug: string): string {
  return `${PREFIX} @${handle}/${slug}`
}

export type InstallTokenRole = 'runner' | 'bin' | 'sub' | 'target' | 'flag' | 'value'

export interface InstallToken {
  text: string
  role: InstallTokenRole
}

const RUNNERS = new Set(['npx', 'pnpx', 'bunx', 'npm', 'pnpm', 'yarn', 'bun', 'deno'])
const SUBCOMMANDS = new Set(['add', 'remove', 'update', 'list', 'install', 'run', 'dlx', 'exec'])

/**
 * Colours an install command by role so the eye lands on the part that changes.
 * The grammar is ours (`npx skilld add <target> [-s <skill>]`), so a shiki
 * grammar pass would cost a highlighter to say less than these six roles do.
 */
export function tokenizeInstallCmd(command: string): InstallToken[] {
  const words = command.trim().split(/\s+/).filter(Boolean)
  const tokens: InstallToken[] = []
  let seenBin = false

  for (const word of words) {
    const previous = tokens.at(-1)

    if (previous?.role === 'flag' && !word.startsWith('-')) {
      tokens.push({ text: word, role: 'value' })
      continue
    }
    if (word.startsWith('-')) {
      tokens.push({ text: word, role: 'flag' })
      continue
    }
    if (!seenBin && RUNNERS.has(word)) {
      tokens.push({ text: word, role: 'runner' })
      continue
    }
    if (!seenBin) {
      seenBin = true
      tokens.push({ text: word, role: 'bin' })
      continue
    }
    if (SUBCOMMANDS.has(word) && !tokens.some(token => token.role === 'sub')) {
      tokens.push({ text: word, role: 'sub' })
      continue
    }
    tokens.push({ text: word, role: 'target' })
  }

  return tokens
}
