import { describe, expect, it } from 'vitest'
import { resolveSkillPageState } from '../../layers/registry/app/utils/skill-page-state'

const path = '/gh/acme/tools/lint'

describe('skill page state', () => {
  it('answers 404 with no canonical for a Skill the registry lacks', () => {
    expect(resolveSkillPageState({ _tag: 'missing' })).toEqual({
      _tag: 'missing',
      status: 404,
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
    })).toEqual({ _tag: 'gone', status: 410, robots: 'noindex,follow', canonicalPath: path })
  })

  it('indexes a curated Skill under its own URL', () => {
    expect(resolveSkillPageState({
      _tag: 'loaded',
      indexable: true,
      sourceGone: false,
      registryPath: path,
      duplicateCanonicalPath: null,
    })).toEqual({ _tag: 'indexable', status: null, robots: 'index,follow', canonicalPath: path })
  })

  it('keeps a registered but non-indexable Skill noindex with a self canonical', () => {
    expect(resolveSkillPageState({
      _tag: 'loaded',
      indexable: false,
      sourceGone: false,
      registryPath: path,
      duplicateCanonicalPath: null,
    })).toEqual({ _tag: 'noindex', status: null, robots: 'noindex,follow', canonicalPath: path })
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
      robots: 'noindex,follow',
      canonicalPath: '/gh/other/tools/lint',
    })
  })

  it('never canonicalises to the homepage while loading or after a failure', () => {
    for (const input of [{ _tag: 'loading' }, { _tag: 'failed' }] as const) {
      const state = resolveSkillPageState(input)
      expect(state.canonicalPath).toBeNull()
      expect(state.robots).toBe('noindex,follow')
      expect(state.status).toBeNull()
    }
  })
})
