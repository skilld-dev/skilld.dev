import { describe, expect, it } from 'vitest'
import { isRegistrySkillPath, isSkilldCacheSkill } from '#shared/skill-path'

describe('isRegistrySkillPath', () => {
  it.each([
    'SKILL.md',
    'skills/nuxt-ai-ready/SKILL.md',
    '.claude/skills/review/SKILL.md',
    // The Skill's own directory may carry a test word; only its parents decide.
    '.claude/skills/test/SKILL.md',
    'skills/tests/SKILL.md',
    'test/SKILL.md',
    // Real Skills, measured in production on 2026-09-29.
    'examples/book-sft-pipeline/SKILL.md',
    'skills/testing/tdd-feature/SKILL.md',
    'codex-rs/skills/src/assets/samples/skill-installer/SKILL.md',
  ])('keeps %s', (path) => {
    expect(isRegistrySkillPath(path)).toBe(true)
  })

  it.each([
    'test/fixtures/agent-skills/skills/seo-audit/SKILL.md',
    'tests/fixtures/skills/known-good/SKILL.md',
    'tests/Fixtures/skills/broken-frontmatter/SKILL.md',
    'packages/opencode/test/fixture/skills/cloudflare/SKILL.md',
    'packages/core/src/eval/__tests__/fixtures/good-skill/SKILL.md',
    'src/__fixtures__/one/SKILL.md',
    'fixtures/bloated-guide/SKILL.md',
    'e2e/fixtures/deployment-skills/e2e-deployment-skill/SKILL.md',
    'pkg/testdata/skill/SKILL.md',
    'node_modules/some-package/skills/one/SKILL.md',
  ])('drops %s', (path) => {
    expect(isRegistrySkillPath(path)).toBe(false)
  })

  it.each([
    'skills/one/README.md',
    'skills/one/skill.md',
    'skills/one/NOTSKILL.md',
    'SKILL.md/other.md',
  ])('drops a path that is not a SKILL.md file: %s', (path) => {
    expect(isRegistrySkillPath(path)).toBe(false)
  })
})

// Shapes copied from production rows and GitHub on 2026-09-29.
const cacheSkill = `---
name: nuxt-skilld
description: "ALWAYS use when writing code importing \\"nuxt\\". Consult for debugging, best practices, or modifying nuxt."
metadata:
  version: 4.4.2
  generated_by: cached
  generated_at: 2026-03-23
---

# nuxt/nuxt \`nuxt\`

**References:** [package.json](./.skilld/pkg/package.json) • [Docs](./.skilld/docs/_INDEX.md)
`

// Before February 2026 the CLI wrote no generated_at and no -skilld suffix.
const oldCacheSkill = `---
name: unjs-citty
description: ALWAYS use when writing code importing "citty".
metadata:
  version: 0.2.1
---

**References:** [package.json](./.skilld/pkg/package.json) • [README](./.skilld/pkg/README.md)
`

// skilld-dev/vue-ecosystem-skills publishes ejected Skills on purpose.
const publishedSkill = `---
name: vue-skilld
description: ALWAYS use when writing code importing "vue".
metadata:
  version: 3.5.0
  generated_at: 2026-03-01
---

**References:** [Docs](./references/docs/_INDEX.md)
`

// harlan-zw/nuxt-seo packages/devtools-layer/skills/devtools-layer-skilld.
const handWrittenSuffixSkill = `---
name: devtools-layer-skilld
description: Shared devtools layer for Nuxt SEO modules.
---

# nuxtseo-layer-devtools
`

// skilld-dev/skills publish-skill names the folder in prose, with no link.
const proseMention = `---
name: publish-skill
description: Publish portable Agent Skills.
---

- Remove absolute paths, secrets, generated caches, and \`.skilld/\` internals.
`

describe('isSkilldCacheSkill', () => {
  it.each([
    ['a cache Skill', cacheSkill],
    ['a cache Skill from before the -skilld suffix', oldCacheSkill],
    ['a link without the ./ prefix', '# x\n\n[README](.skilld/pkg/README.md)'],
  ])('drops %s', (_label, raw) => {
    expect(isSkilldCacheSkill(raw)).toBe(true)
  })

  it.each([
    ['a published Skill that links references/', publishedSkill],
    ['a hand-written Skill named with -skilld', handWrittenSuffixSkill],
    ['a Skill that names .skilld/ in prose', proseMention],
    ['a link to a nested .skilld folder', '[x](docs/.skilld/a.md)'],
  ])('keeps %s', (_label, raw) => {
    expect(isSkilldCacheSkill(raw)).toBe(false)
  })
})
