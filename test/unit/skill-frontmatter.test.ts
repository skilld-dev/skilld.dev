import { describe, expect, it } from 'vitest'
import { parseSkillFile } from '../../layers/registry/server/utils/skill-frontmatter'

describe('parseSkillFile labels', () => {
  it('folds a stripped block description into readable text', () => {
    const parsed = parseSkillFile(`---
name: nuxt-style-readme
description: >-
  Writes and refines a repository README in a concise style.
  Uses only sections supported by the repository.
license: MIT
---`, 'nuxt-style-readme')

    expect(parsed?.description).toBe('Writes and refines a repository README in a concise style. Uses only sections supported by the repository.')
  })

  it('preserves the frontmatter name exactly', () => {
    const parsed = parseSkillFile(`---
name: vue-best-practices
description: Vue guidance
---`, 'different-directory')

    expect(parsed).toMatchObject({
      name: 'different-directory',
      displayName: 'vue-best-practices',
    })
  })

  it('uses the slug unchanged when frontmatter has no name', () => {
    const parsed = parseSkillFile(`---
description: Vue guidance
---`, 'Vue Best Practices')

    expect(parsed).toMatchObject({
      name: 'vue-best-practices',
      displayName: 'vue-best-practices',
    })
  })
})
