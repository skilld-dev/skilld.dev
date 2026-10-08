import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import SkillFileTree from '../../layers/registry/app/components/SkillFileTree.vue'

describe('root Skill file links', () => {
  it('links the license at the stored commit without a SKILL.md directory', async () => {
    const commit = 'c'.repeat(40)
    const wrapper = await mountSuspended(SkillFileTree, {
      props: {
        assets: [{ path: 'LICENSE', size: 10, type: 'other' }],
        owner: 'acme',
        repo: 'skills',
        name: 'setup',
        registryPath: '/gh/acme/skills/setup',
        branch: commit,
        skillPath: 'SKILL.md',
      },
    })
    expect(wrapper.get('a[href*="LICENSE"]').attributes('href')).toBe(`https://github.com/acme/skills/blob/${commit}/LICENSE`)
  })
})
