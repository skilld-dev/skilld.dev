// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  publishedCliInvocation,
  runPublishedCliGrammar,
} from '../../scripts/check-published-cli-grammar'

const betaAgents = [
  'claude-code',
  'codex',
  'cursor',
  'gemini-cli',
  'github-copilot',
  'hermes',
  'openclaw',
  'opencode',
  'windsurf',
]

describe('published CLI grammar', () => {
  it('runs a published package through pnpm without npm exec', () => {
    expect(publishedCliInvocation('2.3.0', 'install')).toEqual({
      file: 'pnpm',
      args: ['--reporter=silent', 'dlx', 'skilld@2.3.0', 'install', '--help'],
    })
  })

  it('checks one published package at a time', async () => {
    let active = 0
    let peakActive = 0
    const readHelp = async (version: string, subcommand?: string) => {
      active += 1
      peakActive = Math.max(peakActive, active)
      await new Promise(resolvePromise => setTimeout(resolvePromise, 5))
      active -= 1

      if (version === '2.3.0')
        return 'USAGE skilld [OPTIONS] add|pull\n'
      if (subcommand === 'install') {
        return `--agent <AGENT>\n  Values: ${betaAgents.join(', ')}.\n`
      }
      return 'Commands:\n  install  Install a Skill\n  run      Run a Skill\n\n'
    }

    const result = await runPublishedCliGrammar({
      readVersion: async tag => tag === 'latest' ? '2.3.0' : '3.0.0-beta.3',
      readHelp,
    })

    expect(result._tag).toBe('clean')
    expect(peakActive).toBe(1)
  })
})
