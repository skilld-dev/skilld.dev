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

describe('parseSkillFile quoted scalars', () => {
  it('decodes escaped quotes inside a double-quoted description', () => {
    const parsed = parseSkillFile(`---
name: pinia-skilld
description: "Intuitive, type safe and flexible Store for Vue. ALWAYS use when writing code importing \\"pinia\\". Consult for debugging, best practices, or modifying pinia."
metadata:
  version: 3.0.4
---`, 'pinia-skilld')

    expect(parsed?.description).toBe('Intuitive, type safe and flexible Store for Vue. ALWAYS use when writing code importing "pinia". Consult for debugging, best practices, or modifying pinia.')
    expect(parsed?.displayName).toBe('pinia-skilld')
  })

  it('decodes a doubled quote inside a single-quoted description', () => {
    const parsed = parseSkillFile(`---
name: clack-skilld
description: 'ALWAYS use when writing code importing ''@clack/prompts''. Consult for debugging.'
---`, 'clack-skilld')

    expect(parsed?.description).toBe('ALWAYS use when writing code importing \'@clack/prompts\'. Consult for debugging.')
  })

  it('keeps an unquoted description exactly as written', () => {
    const parsed = parseSkillFile(`---
name: plain-skilld
description: Writes release notes for a repository, no quoting at all
---`, 'plain-skilld')

    expect(parsed?.description).toBe('Writes release notes for a repository, no quoting at all')
  })

  it('joins a double-quoted description that wraps onto a second line', () => {
    const parsed = parseSkillFile(`---
name: wrapped-skilld
description: "Use when importing \\"vue\\".
  Consult for debugging."
---`, 'wrapped-skilld')

    expect(parsed?.description).toBe('Use when importing "vue". Consult for debugging.')
  })
})
