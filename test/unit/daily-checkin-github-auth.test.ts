import { describe, expect, it, vi } from 'vitest'
import { resolveGithubChildEnv } from '../../scripts/tools/daily-checkin-github-auth.mjs'

function spawnScript(script: Array<number | 'error'>) {
  const calls: Array<{ command: string, args: string[], env: Record<string, string | undefined> }> = []
  const spawn = vi.fn((_command: string, args: string[], options: { env: Record<string, string | undefined> }) => {
    calls.push({ command: _command, args, env: options.env })
    const next = script.shift()
    if (next === 'error')
      return { status: null, error: new Error('spawn ENOENT') }
    return { status: next, stdout: '', stderr: '' }
  })
  return { spawn, calls }
}

const inheritedEnv = {
  PATH: '/usr/bin',
  GITHUB_TOKEN: 'github_pat_expired',
  HOME: '/home/runner',
}

describe('resolveGithubChildEnv', () => {
  it('keeps the inherited env when gh accepts its token', () => {
    const { spawn, calls } = spawnScript([0])

    const resolved = resolveGithubChildEnv(spawn, inheritedEnv)

    expect(resolved.env.GITHUB_TOKEN).toBe('github_pat_expired')
    expect(resolved.rejectedTokens).toEqual([])
    expect(calls).toHaveLength(1)
    expect(calls[0].command).toBe('gh')
    expect(calls[0].args).toEqual(['auth', 'status'])
    expect(calls[0].env.GITHUB_TOKEN).toBe('github_pat_expired')
  })

  it('strips the token gh rejects when the keyring login works', () => {
    const { spawn, calls } = spawnScript([1, 0])

    const resolved = resolveGithubChildEnv(spawn, inheritedEnv)

    expect(resolved.env.GITHUB_TOKEN).toBeUndefined()
    expect(resolved.env.PATH).toBe('/usr/bin')
    expect(resolved.rejectedTokens).toEqual(['GITHUB_TOKEN'])
    expect(calls).toHaveLength(2)
    expect(calls[0].env.GITHUB_TOKEN).toBe('github_pat_expired')
    expect(calls[1].env.GITHUB_TOKEN).toBeUndefined()
  })

  it('strips GH_TOKEN and GITHUB_TOKEN together when both are rejected', () => {
    const { spawn } = spawnScript([1, 0])

    const resolved = resolveGithubChildEnv(spawn, {
      ...inheritedEnv,
      GH_TOKEN: 'gho_also_rejected',
    })

    expect(resolved.env.GH_TOKEN).toBeUndefined()
    expect(resolved.env.GITHUB_TOKEN).toBeUndefined()
    expect(resolved.rejectedTokens).toEqual(['GH_TOKEN', 'GITHUB_TOKEN'])
  })

  it('keeps the inherited env when the keyring does not rescue gh', () => {
    const { spawn, calls } = spawnScript([1, 1])

    const resolved = resolveGithubChildEnv(spawn, inheritedEnv)

    expect(resolved.env.GITHUB_TOKEN).toBe('github_pat_expired')
    expect(resolved.rejectedTokens).toEqual([])
    expect(calls).toHaveLength(2)
  })

  it('skips validation entirely when no token is in the env', () => {
    const { spawn, calls } = spawnScript([])

    const resolved = resolveGithubChildEnv(spawn, { PATH: '/usr/bin', HOME: '/home/runner' })

    expect(resolved.env).toEqual({ PATH: '/usr/bin', HOME: '/home/runner' })
    expect(resolved.rejectedTokens).toEqual([])
    expect(calls).toHaveLength(0)
  })

  it('treats a spawn failure as an unvalidated env and keeps it', () => {
    const { spawn, calls } = spawnScript(['error', 'error'])

    const resolved = resolveGithubChildEnv(spawn, inheritedEnv)

    expect(resolved.env.GITHUB_TOKEN).toBe('github_pat_expired')
    expect(resolved.rejectedTokens).toEqual([])
    expect(calls).toHaveLength(2)
  })
})
