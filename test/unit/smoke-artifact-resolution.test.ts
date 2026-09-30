import { describe, expect, it, vi } from 'vitest'
import { probeGithub, smokeArtifactResolution } from '../../scripts/smoke-artifact-resolution.mjs'

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })

function fakeApi(states: Array<Record<string, unknown>>) {
  let poll = 0
  const fetch = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    if (init?.method === 'POST')
      return json({ ...states[0], resolutionId: 'res_1' }, 202)
    poll++
    return json({ ...states[Math.min(poll, states.length - 1)], resolutionId: 'res_1' })
  })
  return fetch as unknown as typeof globalThis.fetch & { mock: { calls: Array<[URL, RequestInit | undefined]> } }
}

const base = { baseUrl: 'https://smoke.test', timeoutMs: 120_000, wait: async () => {} }

describe('smokeArtifactResolution', () => {
  it('passes once the resolution becomes ready', async () => {
    const fetch = fakeApi([
      { state: 'pending', stage: 'requested', pollAfterMs: 1 },
      { state: 'pending', stage: 'resolving', pollAfterMs: 1 },
      { state: 'ready', artifact: { artifactId: 'art_1' } },
    ])

    const outcome = await smokeArtifactResolution({ ...base, fetch })

    expect(outcome).toEqual({ _tag: 'ready', resolutionId: 'res_1', artifactId: 'art_1', polls: 2 })
    expect(new Headers(fetch.mock.calls[0]![1]?.headers).get('idempotency-key')).toMatch(/^smoke-/)
  })

  it('fails with the build error code when the resolution fails', async () => {
    const fetch = fakeApi([
      { state: 'pending', stage: 'requested', pollAfterMs: 1 },
      { state: 'failed', code: 'SERVICE_UNAVAILABLE', retryable: true },
    ])

    const outcome = await smokeArtifactResolution({ ...base, fetch })

    expect(outcome).toMatchObject({ _tag: 'failed', reason: 'build_failed' })
    expect(outcome._tag === 'failed' && outcome.detail).toContain('SERVICE_UNAVAILABLE')
  })

  it('fails on timeout while the build is still pending', async () => {
    let clock = 0
    const fetch = fakeApi([{ state: 'pending', stage: 'resolving', pollAfterMs: 1000 }])

    const outcome = await smokeArtifactResolution({
      ...base,
      fetch,
      timeoutMs: 2500,
      now: () => clock,
      wait: async (ms) => { clock += ms },
    })

    expect(outcome).toMatchObject({ _tag: 'failed', reason: 'timeout', resolutionId: 'res_1' })
    expect(outcome._tag === 'failed' && outcome.detail).toContain('resolving')
  })

  it('fails when the request itself is rejected', async () => {
    const fetch = vi.fn(async () => json({ code: 'INVALID_SOURCE' }, 400)) as unknown as typeof globalThis.fetch

    const outcome = await smokeArtifactResolution({ ...base, fetch })

    expect(outcome).toMatchObject({ _tag: 'failed', reason: 'request_rejected' })
  })
})

describe('smokeArtifactResolution causes', () => {
  const pendingForever = () => fakeApi([{ state: 'pending', stage: 'resolving', pollAfterMs: 1000 }])
  const clockOptions = () => {
    let clock = 0
    return {
      timeoutMs: 2500,
      now: () => clock,
      wait: async (ms: number) => {
        clock += ms
      },
    }
  }

  it('names GitHub when it is unreachable and the build is still pending', async () => {
    const outcome = await smokeArtifactResolution({
      baseUrl: 'https://smoke.test',
      fetch: pendingForever(),
      probe: async () => ({ _tag: 'unreachable', reason: 'The operation was aborted due to timeout' }),
      ...clockOptions(),
    })

    expect(outcome).toMatchObject({ _tag: 'failed', reason: 'timeout', cause: 'github_unreachable' })
    expect(outcome._tag === 'failed' && outcome.detail).toContain('GitHub unreachable from Cloudflare')
  })

  it('names the build when GitHub answers and the build is still pending', async () => {
    const outcome = await smokeArtifactResolution({
      baseUrl: 'https://smoke.test',
      fetch: pendingForever(),
      probe: async () => ({ _tag: 'reachable', status: 200 }),
      ...clockOptions(),
    })

    expect(outcome).toMatchObject({ _tag: 'failed', reason: 'timeout', cause: 'build_broken' })
    expect(outcome._tag === 'failed' && outcome.detail).toContain('build broken')
  })

  it('probes after a retryable failure but not after a blocked build', async () => {
    const probe = vi.fn(async () => ({ _tag: 'reachable' as const, status: 200 }))
    const retryable = await smokeArtifactResolution({
      ...base,
      probe,
      fetch: fakeApi([{ state: 'pending', pollAfterMs: 1 }, { state: 'failed', code: 'SERVICE_UNAVAILABLE', retryable: true }]),
    })
    const blocked = await smokeArtifactResolution({
      ...base,
      probe,
      fetch: fakeApi([{ state: 'pending', pollAfterMs: 1 }, { state: 'blocked', checkResults: [] }]),
    })

    expect(retryable).toMatchObject({ reason: 'build_failed', cause: 'build_broken' })
    expect(blocked).toMatchObject({ reason: 'build_blocked' })
    expect(blocked).not.toHaveProperty('cause')
    expect(probe).toHaveBeenCalledTimes(1)
  })
})

describe('probeGithub', () => {
  it('counts a rate limit answer as reachable', async () => {
    const fetch = vi.fn(async () => new Response('', { status: 403 })) as unknown as typeof globalThis.fetch
    expect(await probeGithub(fetch)).toEqual({ _tag: 'reachable', status: 403 })
  })

  it('reports a 520 and a thrown error as unreachable', async () => {
    expect(await probeGithub((async () => new Response('', { status: 520 })) as unknown as typeof globalThis.fetch))
      .toEqual({ _tag: 'unreachable', reason: 'answered 520' })
    const lost = vi.fn(async () => {
      throw new TypeError('Network connection lost.')
    }) as unknown as typeof globalThis.fetch
    expect(await probeGithub(lost))
      .toEqual({ _tag: 'unreachable', reason: 'Network connection lost.' })
  })
})
