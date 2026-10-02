import { describe, expect, it } from 'vitest'
import { prepareTag, publishSkill } from '../src/github-client'
import { parseGithubEvent, verifyGithubSignature } from '../src/github-events'

const repository = { id: 10, name: 'package', private: false, owner: { login: 'harlan-zw' } }
const installation = { id: 20 }

describe('gitHub tag events', () => {
  it('accepts tag creation on an installed public repository', () => {
    expect(parseGithubEvent('create', { ref_type: 'tag', ref: 'v1.0.0', repository, installation })).toMatchObject({ _tag: 'Tags', tags: [{ tag: 'v1.0.0', repositoryId: 10, installationId: 20 }] })
  })
  it.each([
    { ref_type: 'branch', ref: 'main', repository, installation },
    { ref_type: 'tag', ref: 'v1.0.0', repository: { ...repository, private: true }, installation },
    { ref_type: 'tag', ref: 'v1.0.0', repository },
  ])('does not create jobs for unsupported events', (payload) => {
    expect(parseGithubEvent('create', payload)._tag).not.toBe('Tags')
  })
  it('rejects forged signatures', async () => {
    expect(await verifyGithubSignature('secret', new TextEncoder().encode('{}'), `sha256=${'0'.repeat(64)}`)).toBe(false)
  })
})

describe('skill publication', () => {
  const context = { owner: 'harlan-zw', name: 'package', repositoryId: 10, installationId: 20, tag: 'v1.0.0', targetSha: 'a'.repeat(40), baseSha: 'b'.repeat(40), baseBranch: 'main', skillRoot: 'skills/package', input: { spec: 'package@1.0.0', name: 'package', currentSkill: [{ path: 'SKILL.md', content: 'old' }] } }
  it('stops before writing when the base moves', async () => {
    const calls: string[] = []
    const result = await publishSkill(context, [{ path: 'SKILL.md', content: 'new' }], async (path, method) => {
      calls.push(`${method ?? 'GET'} ${path}`)
      return { sha: 'c'.repeat(40) }
    })
    expect(result._tag).toBe('Conflict')
    expect(calls).toEqual(['GET /repos/harlan-zw/package/commits/main'])
  })
  it('skips identical Skill files without network calls', async () => {
    const result = await publishSkill(context, context.input.currentSkill, async () => {
      throw new Error('Unexpected request')
    })
    expect(result).toEqual({ _tag: 'Unchanged' })
  })
  it('rejects unsafe output before GitHub writes', async () => {
    const result = await publishSkill(context, [{ path: '../package.json', content: 'overwrite' }], async () => {
      throw new Error('Unexpected request')
    })
    expect(result).toEqual({ _tag: 'Rejected', reason: 'INVALID_OUTPUT_PATHS' })
  })
  it('preserves a closed pull request without writing again', async () => {
    const result = await publishSkill(context, [{ path: 'SKILL.md', content: 'new' }], async (path, method) => {
      if (method && method !== 'GET')
        throw new Error('Unexpected GitHub write')
      return path.includes('/pulls?') ? [{ html_url: 'https://github.com/harlan-zw/package/pull/1', state: 'closed' }] : { sha: context.baseSha }
    })
    expect(result).toEqual({ _tag: 'Published', url: 'https://github.com/harlan-zw/package/pull/1' })
  })
  it('does not replace an existing branch', async () => {
    const result = await publishSkill(context, [{ path: 'SKILL.md', content: 'new' }], async (path, method) => {
      if (method && method !== 'GET')
        throw new Error('Unexpected GitHub write')
      return path.includes('/pulls?') ? [] : { sha: context.baseSha }
    })
    expect(result).toEqual({ _tag: 'Conflict' })
  })
  it('publishes only Skill changes and marks the pull request as a draft', async () => {
    const writes: { path: string, body: unknown }[] = []
    const result = await publishSkill(context, [{ path: 'SKILL.md', content: 'new' }], async (path, method, body) => {
      if (method === 'POST') {
        writes.push({ path, body })
        return path.endsWith('/pulls') ? { html_url: 'https://github.com/harlan-zw/package/pull/2' } : { sha: 'd'.repeat(40) }
      }
      if (path.includes('/pulls?'))
        return []
      if (path.includes('/git/ref/'))
        return null
      if (path.includes('/git/commits/'))
        return { tree: { sha: 'e'.repeat(40) } }
      return { sha: context.baseSha }
    })
    expect(result).toEqual({ _tag: 'Published', url: 'https://github.com/harlan-zw/package/pull/2' })
    expect(writes.find(write => write.path.endsWith('/git/trees'))?.body).toMatchObject({ tree: [{ path: 'skills/package/SKILL.md', mode: '100644', type: 'blob', sha: 'd'.repeat(40) }] })
    expect(writes.find(write => write.path.endsWith('/pulls'))?.body).toMatchObject({ draft: true, base: 'main' })
  })
})

describe('tag preparation', () => {
  const request = { owner: 'harlan-zw', name: 'package', repositoryId: 10, installationId: 20, tag: 'v1.0.0' }
  const target = 'a'.repeat(40)
  const base = 'b'.repeat(40)
  const api = async (path: string) => {
    if (path === '/repos/harlan-zw/package')
      return { id: 10, private: false, default_branch: 'main' }
    if (path.includes('/commits/v1.0.0'))
      return { sha: target }
    if (path.includes('/contents/package.json'))
      return { encoding: 'base64', content: btoa(JSON.stringify({ name: 'package', version: '1.0.0' })) }
    if (path.includes('/commits/main'))
      return { sha: base }
    if (path.includes('/git/trees/'))
      return { truncated: false, tree: [{ path: 'skills/package/SKILL.md', type: 'blob', sha: 'c'.repeat(40) }] }
    if (path.includes('/contents/skills/package/SKILL.md'))
      return { encoding: 'base64', content: btoa('---\nname: package\ndescription: Package guidance.\n---\n') }
    throw new Error(`Unexpected GitHub request ${path}`)
  }
  it('keeps the tag source and main baseline as separate exact commits', async () => {
    const fetcher = async () => Response.json({ name: 'package', version: '1.0.0', gitHead: target, dist: { integrity: 'unused' } })
    expect(await prepareTag(request, api, fetcher)).toMatchObject({ _tag: 'Prepared', value: { targetSha: target, baseSha: base, skillRoot: 'skills/package', input: { spec: 'package@1.0.0' } } })
  })
  it('waits when a new tag precedes npm publication', async () => {
    expect(await prepareTag(request, api, async () => new Response(null, { status: 404 }))).toEqual({ _tag: 'Pending', reason: 'PACKAGE_NOT_PUBLISHED' })
  })
  it('rejects a package built from a different commit', async () => {
    const fetcher = async () => Response.json({ name: 'package', version: '1.0.0', gitHead: 'd'.repeat(40), dist: { integrity: 'unused' } })
    expect(await prepareTag(request, api, fetcher)).toEqual({ _tag: 'Skipped', reason: 'PACKAGE_TAG_PROVENANCE_MISMATCH' })
  })
})
