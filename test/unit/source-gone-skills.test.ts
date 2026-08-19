import { describe, expect, it, vi } from 'vitest'
import { goneSkillKeys, resolveGoneSkillKeys, skillKeyFromPath } from '../../server/utils/source-gone-skills'

const microsoft = {
  owner: 'microsoft',
  repo: 'skills',
  name: 'entra-app-registration',
  slug: 'microsoft/entra-app-registration',
  name_collides_with_repo: 0,
}

describe('skillKeyFromPath', () => {
  it('reads the flat slug a skill answers on', () => {
    expect(skillKeyFromPath('/gh/microsoft/entra-app-registration'))
      .toBe('microsoft/entra-app-registration')
  })

  it('reads the full owner/repo/name path', () => {
    expect(skillKeyFromPath('/gh/microsoft/skills/entra-app-registration'))
      .toBe('microsoft/skills/entra-app-registration')
  })

  it('lowercases, because registry identity is matched case-insensitively', () => {
    expect(skillKeyFromPath('/gh/Microsoft/Entra-App-Registration'))
      .toBe('microsoft/entra-app-registration')
  })

  it('tolerates a trailing slash', () => {
    expect(skillKeyFromPath('/gh/microsoft/entra-app-registration/'))
      .toBe('microsoft/entra-app-registration')
  })

  it('ignores paths that are not skills', () => {
    expect(skillKeyFromPath('/gh/microsoft')).toBeNull()
    expect(skillKeyFromPath('/gh/')).toBeNull()
    expect(skillKeyFromPath('/skills/microsoft/entra-app-registration')).toBeNull()
    expect(skillKeyFromPath('/')).toBeNull()
    expect(skillKeyFromPath('/gh/a/b/c/d')).toBeNull()
    expect(skillKeyFromPath('/gh/a//b')).toBeNull()
  })
})

describe('goneSkillKeys', () => {
  it('covers both shapes the same skill answers on', () => {
    expect(goneSkillKeys([microsoft])).toEqual([
      'microsoft/entra-app-registration',
      'microsoft/skills/entra-app-registration',
    ])
  })

  it('drops the flat slug when a repository already owns that path', () => {
    // `/gh/acme/toolkit` is the repository page; 410 there would break a live page.
    const keys = goneSkillKeys([{
      owner: 'acme',
      repo: 'skills',
      name: 'toolkit',
      slug: 'acme/toolkit',
      name_collides_with_repo: 1,
    }])
    expect(keys).toEqual(['acme/skills/toolkit'])
    expect(keys).not.toContain('acme/toolkit')
  })

  it('survives a missing slug', () => {
    expect(goneSkillKeys([{ ...microsoft, slug: null }]))
      .toEqual(['microsoft/skills/entra-app-registration'])
  })

  it('deduplicates skills sharing a path shape', () => {
    expect(goneSkillKeys([microsoft, microsoft])).toEqual([
      'microsoft/entra-app-registration',
      'microsoft/skills/entra-app-registration',
    ])
  })

  it('is empty when nothing is gone', () => {
    expect(goneSkillKeys([])).toEqual([])
  })
})

describe('resolveGoneSkillKeys', () => {
  const goneRow = {
    owner: 'microsoft',
    repo: 'skills',
    name: 'entra-app-registration',
    slug: null,
    name_collides_with_repo: 0,
  }

  function stubDb(all: () => Promise<{ results: typeof goneRow[] }>) {
    return {
      prepare: () => ({ bind: () => ({ all }) }),
    } as unknown as Parameters<typeof resolveGoneSkillKeys>[1]
  }

  it('returns the cached key set without touching the database', async () => {
    const all = vi.fn()
    const keys = await resolveGoneSkillKeys(
      { getItem: async () => ['acme/skills/deploy'], setItem: async () => {} },
      stubDb(all as never),
    )

    expect(keys).toEqual(['acme/skills/deploy'])
    expect(all).not.toHaveBeenCalled()
  })

  it('treats a KV read failure as a miss and answers from the database', async () => {
    // Sentry SKILLD-S: `KV GET failed: 500 Internal Server Error` travelled out
    // of this read-through cache and 500'd every `/gh` page.
    const keys = await resolveGoneSkillKeys(
      {
        getItem: async () => { throw new Error('KV GET failed: 500 Internal Server Error') },
        setItem: async () => {},
      },
      stubDb(async () => ({ results: [goneRow] })),
    )

    expect(keys).toEqual(['microsoft/skills/entra-app-registration'])
  })

  it('answers null when the database read fails, rather than failing the page', async () => {
    const keys = await resolveGoneSkillKeys(
      { getItem: async () => null, setItem: async () => {} },
      stubDb(async () => { throw new Error('D1_ERROR: {"D1_RESET_DO":true}') }),
    )

    expect(keys).toBeNull()
  })

  it('still answers when the cache write fails after a database read', async () => {
    const keys = await resolveGoneSkillKeys(
      {
        getItem: async () => null,
        setItem: async () => { throw new Error('KV PUT failed: 429 Too Many Requests') },
      },
      stubDb(async () => ({ results: [goneRow] })),
    )

    expect(keys).toEqual(['microsoft/skills/entra-app-registration'])
  })
})
