import { describe, expect, it } from 'vitest'
import { resolveSkillPageState } from '../../layers/registry/app/utils/skill-page-state'

const path = '/gh/acme/tools/lint'

describe('skill page state', () => {
  it('answers 404 with no canonical for a Skill the registry lacks', () => {
    expect(resolveSkillPageState({ _tag: 'missing' })).toEqual({
      _tag: 'missing',
      status: 404,
      retryAfterSeconds: null,
      robots: 'noindex,follow',
      canonicalPath: null,
    })
  })

  it('answers 410 and self-canonicalises a Skill removed upstream', () => {
    expect(resolveSkillPageState({
      _tag: 'loaded',
      indexable: true,
      sourceGone: true,
      registryPath: path,
      duplicateCanonicalPath: null,
    })).toEqual({ _tag: 'gone', status: 410, retryAfterSeconds: null, robots: 'noindex,follow', canonicalPath: path })
  })

  it('indexes a curated Skill under its own URL', () => {
    expect(resolveSkillPageState({
      _tag: 'loaded',
      indexable: true,
      sourceGone: false,
      registryPath: path,
      duplicateCanonicalPath: null,
    })).toEqual({ _tag: 'indexable', status: null, retryAfterSeconds: null, robots: 'index,follow', canonicalPath: path })
  })

  it('keeps a registered but non-indexable Skill noindex with a self canonical', () => {
    expect(resolveSkillPageState({
      _tag: 'loaded',
      indexable: false,
      sourceGone: false,
      registryPath: path,
      duplicateCanonicalPath: null,
    })).toEqual({ _tag: 'noindex', status: null, retryAfterSeconds: null, robots: 'noindex,follow', canonicalPath: path })
  })

  it('points a weaker duplicate at its canonical Skill', () => {
    expect(resolveSkillPageState({
      _tag: 'loaded',
      indexable: true,
      sourceGone: false,
      registryPath: path,
      duplicateCanonicalPath: '/gh/other/tools/lint',
    })).toEqual({
      _tag: 'duplicate',
      status: null,
      retryAfterSeconds: null,
      robots: 'noindex,follow',
      canonicalPath: '/gh/other/tools/lint',
    })
  })

  it('answers 503 with Retry-After and no noindex when the Skill API fails', () => {
    expect(resolveSkillPageState({ _tag: 'failed' })).toEqual({
      _tag: 'failed',
      status: 503,
      retryAfterSeconds: 300,
      robots: null,
      canonicalPath: null,
    })
  })

  it('never canonicalises to the homepage while loading or after a failure', () => {
    for (const input of [{ _tag: 'loading' }, { _tag: 'failed' }] as const)
      expect(resolveSkillPageState(input).canonicalPath).toBeNull()
  })

  it('sends Retry-After only with a 503', () => {
    const inputs = [
      { _tag: 'loading' },
      { _tag: 'missing' },
      { _tag: 'failed' },
      { _tag: 'loaded', indexable: true, sourceGone: true, registryPath: path, duplicateCanonicalPath: null },
      { _tag: 'loaded', indexable: true, sourceGone: false, registryPath: path, duplicateCanonicalPath: null },
    ] as const
    for (const input of inputs) {
      const state = resolveSkillPageState(input)
      expect(state.retryAfterSeconds !== null).toBe(state.status === 503)
    }
  })
})
