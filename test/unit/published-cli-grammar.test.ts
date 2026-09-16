// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  cliRequirement,
  cliRequirementFor,
  publishedCliInvocation,
  runPublishedCliGrammar,
} from '../../scripts/check-published-cli-grammar'

const agents = [
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

const requirement = { minimumMajor: 3, commands: ['install', 'run'], agents, misprinted: [] }

function v3Help(_version: string, subcommand?: string): Promise<string> {
  if (subcommand === 'install')
    return Promise.resolve(`--agent <AGENT>\n  Values: ${agents.join(', ')}.\n`)
  return Promise.resolve('Commands:\n  install  Install a Skill\n  run      Run a Skill\n\n')
}

describe('published CLI grammar', () => {
  it('runs a published package through pnpm without npm exec', () => {
    expect(publishedCliInvocation('3.0.0', 'install')).toEqual({
      file: 'pnpm',
      args: ['--reporter=silent', 'dlx', 'skilld@3.0.0', 'install', '--help'],
    })
  })

  it('passes when latest speaks every printed command and --agent value', async () => {
    const result = await runPublishedCliGrammar({
      readVersion: async () => '3.0.0',
      readHelp: v3Help,
    }, requirement)

    expect(result._tag).toBe('clean')
    expect(result.check.fetchRefused).toBe(false)
  })

  it('blocks when latest is still v2', async () => {
    const result = await runPublishedCliGrammar({
      readVersion: async () => '2.3.0',
      readHelp: v3Help,
    }, requirement)

    expect(result._tag).toBe('blocked')
    expect(result.check.problems).toContain('requires major 3 or newer')
  })

  it('blames a minimumReleaseAge refusal, not the grammar', async () => {
    const refusal = [
      '[ERR_PNPM_NO_MATURE_MATCHING_VERSION] skilld@3.0.0 was published at',
      '2026-09-16T09:38:00.000Z, within the minimumReleaseAge cutoff',
      '(2026-09-17T09:38:00.000Z)',
    ].join(' ')
    const result = await runPublishedCliGrammar({
      readVersion: async () => '3.0.0',
      readHelp: async () => refusal,
    }, requirement)

    expect(result._tag).toBe('blocked')
    expect(result.check.fetchRefused).toBe(true)
    expect(result.check.problems.join(' ')).toMatch(/minimumReleaseAge/)
    expect(result.check.problems.join(' ')).not.toMatch(/could not read/)
  })

  it('keeps the unreadable-grammar verdict when pnpm answers normally', async () => {
    const result = await runPublishedCliGrammar({
      readVersion: async () => '3.0.0',
      readHelp: async () => 'some unrelated help text\n',
    }, requirement)

    expect(result._tag).toBe('blocked')
    expect(result.check.fetchRefused).toBe(false)
    expect(result.check.problems).toContain('could not read its command list')
  })
})

describe('printed CLI commands', () => {
  it('blocks a command pinned to another npm tag', async () => {
    const pinned = cliRequirementFor(['npx skilld@beta run skilld:owner/repo/skill'])
    const result = await runPublishedCliGrammar({
      readVersion: async () => '3.0.0',
      readHelp: v3Help,
    }, pinned)

    expect(result._tag).toBe('blocked')
    expect(result.check.problems.join(' ')).toContain('npx skilld@beta run')
  })

  it('prints every site command as npx skilld', () => {
    expect(cliRequirement().misprinted).toEqual([])
    expect(cliRequirement().commands).toEqual(['add', 'install', 'run'])
  })
})
