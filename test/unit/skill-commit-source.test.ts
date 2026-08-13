import { describe, expect, it } from 'vitest'
import { findSkillCommitSource } from '../../layers/registry/server/utils/skill-commit-source'

describe('skill commit source', () => {
  it('loads the stored skill path with the canonical repository identity', async () => {
    const db = database({
      rendered_skill_path: 'skills/nuxt-style-readme/SKILL.md',
      source_owner: 'jonathanxdr',
      source_repo: 'nuxt-style-readme-skill',
    })

    const source = await findSkillCommitSource(db, {
      owner: 'mirror',
      repo: 'skills',
      name: 'nuxt-style-readme',
    })

    expect(source).toEqual({
      owner: 'jonathanxdr',
      repo: 'nuxt-style-readme-skill',
      path: 'skills/nuxt-style-readme/SKILL.md',
    })
  })

  it('returns null when the registry has no resolved skill path', async () => {
    const db = database({
      rendered_skill_path: null,
      source_owner: null,
      source_repo: null,
    })

    await expect(findSkillCommitSource(db, {
      owner: 'acme',
      repo: 'skills',
      name: 'missing',
    })).resolves.toBeNull()
  })
})

function database(row: Record<string, unknown> | null): D1Database {
  return {
    prepare: () => ({
      bind: () => ({
        first: async () => row,
      }),
    }),
  } as unknown as D1Database
}
