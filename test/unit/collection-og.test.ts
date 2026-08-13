import { describe, expect, it } from 'vitest'
import { resolveCollectionOgProps } from '../../app/utils/collection-og'

describe('resolveCollectionOgProps', () => {
  it('uses author identity, skill display names, and the first curator note', () => {
    const result = resolveCollectionOgProps({
      authorLogin: 'harlan-zw',
      authorName: 'Harlan Wilton',
      authorAvatar: 'https://avatars.example/harlan.png',
      name: 'Nuxt stack',
      preamble: 'My production defaults.',
      skills: [
        { owner: 'nuxt', repo: 'skills', name: 'nuxt-frontend-design', displayName: 'Nuxt Frontend Design', reason: null },
        { owner: 'antfu', repo: 'skills', name: 'vite', displayName: 'Vite', reason: 'Fast and focused.' },
      ],
    })

    expect(result).toEqual({
      name: 'Nuxt stack',
      description: 'My production defaults.',
      curatorHandle: 'harlan-zw',
      curatorName: 'Harlan Wilton',
      curatorAvatar: 'https://avatars.example/harlan.png',
      skillCount: 2,
      skills: ['Nuxt Frontend Design', 'Vite'],
      reason: 'Fast and focused.',
      reasonSkill: 'Vite',
    })
  })

  it('falls back to GitHub identity and canonical skill names', () => {
    const result = resolveCollectionOgProps({
      authorLogin: 'antfu',
      authorName: null,
      authorAvatar: null,
      name: 'Tools',
      preamble: null,
      skills: [
        { owner: 'antfu', repo: 'skills', name: 'vite', displayName: null, reason: null },
      ],
    })

    expect(result.curatorName).toBe('antfu')
    expect(result.curatorAvatar).toBe('https://github.com/antfu.png?size=128')
    expect(result.skills).toEqual(['vite'])
  })
})
