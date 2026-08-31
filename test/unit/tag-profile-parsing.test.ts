import { describe, expect, it } from 'vitest'
import { parseTagSkillRow } from '../../layers/registry/server/utils/tag-profile'

const validRow = {
  name: 'nuxt',
  owner: 'onmax',
  repo: 'nuxt-skills',
  repo_skill_count: 3,
  display_name: 'Nuxt',
  slug: 'onmax/nuxt-skills/nuxt',
  stars: 10,
  description: 'Nuxt guidance.',
  rendered_raw_sha256: null,
  pushed_at: null,
  modified_at: null,
  first_seen_at: null,
}

describe('tag profile skill parsing', () => {
  it.each([
    { field: 'owner', value: '' },
    { field: 'repo', value: '' },
    { field: 'name', value: '' },
    { field: 'repo', value: '   ' },
  ] as const)('rejects a row with an invalid $field', ({ field, value }) => {
    expect(parseTagSkillRow({ ...validRow, [field]: value })).toEqual({
      _tag: 'invalid',
      reason: 'missing-identity',
    })
  })

  it('parses and normalizes a complete row', () => {
    const result = parseTagSkillRow({
      ...validRow,
      owner: ' onmax ',
      repo: ' nuxt-skills ',
      name: ' nuxt ',
    })

    expect(result._tag).toBe('valid')
    if (result._tag === 'valid') {
      expect(result.skill).toMatchObject({
        owner: 'onmax',
        repo: 'nuxt-skills',
        name: 'nuxt',
      })
    }
  })
})
