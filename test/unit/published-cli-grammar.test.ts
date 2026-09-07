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
    for (const check of result.checks)
      expect(check.fetchRefused).toBe(false)
  })

  it('blames a minimumReleaseAge refusal, not the grammar', async () => {
    const refusal = [
      '[ERR_PNPM_NO_MATURE_MATCHING_VERSION] skilld@3.0.0-beta.4 was published at',
      '2026-09-04T04:18:08.578Z, within the minimumReleaseAge cutoff',
      '(2026-09-05T04:18:08.578Z)',
    ].join(' ')
    const result = await runPublishedCliGrammar({
      readVersion: async tag => tag === 'latest' ? '2.3.0' : '3.0.0-beta.4',
      readHelp: async () => refusal,
    })

    expect(result._tag).toBe('blocked')
    for (const check of result.checks) {
      expect(check.fetchRefused).toBe(true)
      expect(check.problems.join(' ')).toMatch(/minimumReleaseAge/)
      expect(check.problems.join(' ')).not.toMatch(/could not read/)
    }
  })

  it('keeps the unreadable-grammar verdict when pnpm answers normally', async () => {
    const result = await runPublishedCliGrammar({
      readVersion: async tag => tag === 'latest' ? '2.3.0' : '3.0.0-beta.4',
      readHelp: async () => 'some unrelated help text\n',
    })

    expect(result._tag).toBe('blocked')
    for (const check of result.checks) {
      expect(check.fetchRefused).toBe(false)
      expect(check.problems).toContain('could not read its command list')
    }
  })
})
