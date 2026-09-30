import type { GithubReadFailure } from '../../layers/artifact-delivery/server/utils/github-source'
import { describe, expect, it, vi } from 'vitest'
import {
  GITHUB_READ_MAX_BUDGET_MS,
  githubEndpointPath,
  readGithubWithRetry,
} from '../../layers/artifact-delivery/server/utils/github-read'
import {
  createPublicGithubSourceClient,
} from '../../layers/artifact-delivery/server/utils/github-source'

const commitSha = '0123456789abcdef0123456789abcdef01234567'
const treeSha = '89abcdef0123456789abcdef0123456789abcdef'
const request = {
  provider: 'github' as const,
  owner: 'skilld-dev',
  repository: 'skills',
  selector: { type: 'path' as const, path: '.' },
}

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
const repository = () => json({ id: 1, name: 'skills', owner: { login: 'skilld-dev' }, private: false, default_branch: 'main' })
const ref = () => json({ ref: 'refs/heads/main', object: { type: 'commit', sha: commitSha } })
const commit = () => json({ sha: commitSha, commit: { tree: { sha: treeSha } } })

function clientWith(fetchMock: ReturnType<typeof vi.fn>, failures: GithubReadFailure[] = []) {
  return createPublicGithubSourceClient({
    fetch: fetchMock as unknown as typeof fetch,
    sleep: async () => {},
    random: () => 0,
    onReadFailure: failure => failures.push(failure),
  })
}

describe('githubEndpointPath', () => {
  it('drops the query string', () => {
    expect(githubEndpointPath('/repos/a/b/git/trees/abc?recursive=1&access_token=x')).toBe('/repos/a/b/git/trees/abc')
  })
})

describe('readGithubWithRetry', () => {
  it('keeps the whole budget under twenty seconds', () => {
    expect(GITHUB_READ_MAX_BUDGET_MS).toBeLessThan(20_000)
  })

  it('does not retry a fatal answer', async () => {
    const attempt = vi.fn(async () => ({ _tag: 'fatal' as const, reason: 'bad', status: 422 }))
    const result = await readGithubWithRetry(attempt, { sleep: async () => {} })
    expect(result).toEqual({ _tag: 'failed', reason: 'bad', status: 422, attempts: 1 })
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it('waits a short jittered delay before the second try', async () => {
    const sleep = vi.fn(async () => {})
    await readGithubWithRetry(async () => ({ _tag: 'transient' as const, reason: 'x', status: null }), { sleep, random: () => 1 })
    expect(sleep).toHaveBeenCalledWith(400)
  })
})

describe('github Artifact reads after a network failure', () => {
  it('retries a timeout and resolves', async () => {
    const urls: string[] = []
    let first = true
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      urls.push(url)
      if (url.endsWith('/repos/skilld-dev/skills')) {
        if (first) {
          first = false
          throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
        }
        return repository()
      }
      if (url.endsWith('/git/ref/heads/main'))
        return ref()
      return commit()
    })

    const result = await clientWith(fetchMock).resolve(request)

    expect(result).toMatchObject({ _tag: 'resolved', source: { commitSha, treeSha } })
    expect(urls.filter(url => url.endsWith('/repos/skilld-dev/skills'))).toHaveLength(2)
  })

  it.each([520, 522, 524])('retries a %i answer', async (status) => {
    let first = true
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/repos/skilld-dev/skills')) {
        if (first) {
          first = false
          return new Response('', { status })
        }
        return repository()
      }
      return url.endsWith('/git/ref/heads/main') ? ref() : commit()
    })

    expect(await clientWith(fetchMock).resolve(request)).toMatchObject({ _tag: 'resolved' })
  })

  it('retries a truncated body', async () => {
    let first = true
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/repos/skilld-dev/skills')) {
        if (first) {
          first = false
          return new Response('{"id": 1, "name": "ski', { status: 200 })
        }
        return repository()
      }
      return url.endsWith('/git/ref/heads/main') ? ref() : commit()
    })

    expect(await clientWith(fetchMock).resolve(request)).toMatchObject({ _tag: 'resolved' })
  })

  it('retries a lost connection while the body streams', async () => {
    let first = true
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/repos/skilld-dev/skills')) {
        if (first) {
          first = false
          const body = new ReadableStream({
            pull(controller) {
              controller.error(new TypeError('Network connection lost.'))
            },
          })
          return new Response(body, { status: 200 })
        }
        return repository()
      }
      return url.endsWith('/git/ref/heads/main') ? ref() : commit()
    })

    expect(await clientWith(fetchMock).resolve(request)).toMatchObject({ _tag: 'resolved' })
  })

  it('does not retry a 404 or a 422', async () => {
    const notFound = vi.fn(async () => json({}, 404))
    expect(await clientWith(notFound).resolve(request)).toMatchObject({ _tag: 'rejected', code: 'SOURCE_NOT_FOUND' })
    expect(notFound).toHaveBeenCalledTimes(1)

    const failures: GithubReadFailure[] = []
    const unprocessable = vi.fn(async () => json({}, 422))
    await expect(clientWith(unprocessable, failures).resolve(request)).rejects.toThrow('422')
    expect(unprocessable).toHaveBeenCalledTimes(1)
    expect(failures).toMatchObject([{ status: 422, attempts: 1 }])
  })

  it('names the step and endpoint after two failures, and reads no other source', async () => {
    const failures: GithubReadFailure[] = []
    const fetchMock = vi.fn(async () => new Response('', { status: 520, headers: { authorization: 'nope' } }))

    const outcome = clientWith(fetchMock, failures).resolve({ ...request, selector: { type: 'path', path: 'skills/demo' } })

    await expect(outcome).rejects.toThrow('GitHub read failed at repository /repos/skilld-dev/skills: GitHub returned 520')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(failures).toEqual([{ step: 'repository', endpoint: '/repos/skilld-dev/skills', reason: 'GitHub returned 520', status: 520, attempts: 2 }])
    expect(JSON.stringify(failures)).not.toContain('Bearer')
  })

  it('re-requests the same pinned commit on retry', async () => {
    const other = 'f'.repeat(40)
    const urls: string[] = []
    let failedOnce = false
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      urls.push(url)
      if (url.endsWith('/repos/skilld-dev/skills'))
        return repository()
      if (url.endsWith(`/commits/${commitSha}`)) {
        if (!failedOnce) {
          failedOnce = true
          return new Response('', { status: 522 })
        }
        return commit()
      }
      return json({ sha: other, commit: { tree: { sha: treeSha } } })
    })

    const result = await clientWith(fetchMock).resolve({ ...request, ref: { type: 'commit', value: commitSha } })

    expect(result).toMatchObject({ _tag: 'resolved', source: { commitSha } })
    expect(urls.filter(url => url.includes('/commits/'))).toEqual([
      `https://api.github.com/repos/skilld-dev/skills/commits/${commitSha}`,
      `https://api.github.com/repos/skilld-dev/skills/commits/${commitSha}`,
    ])
  })
})
