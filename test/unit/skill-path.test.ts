import { describe, expect, it } from 'vitest'
import { isRegistrySkillPath } from '#shared/skill-path'

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
