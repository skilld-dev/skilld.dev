import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

describe('skill receipts timestamps', () => {
  it('renders deterministic absolute timestamps', async () => {
    const wrapper = await mountSuspended(
      await import('../../layers/registry/app/components/_SkillReceiptsPanel.vue').then(module => module.default),
      {
        props: {
          provenance: {
            owner: 'antfu',
            repo: 'skills',
            branch: 'main',
            skillPath: 'skills/vite/SKILL.md',
            sourceCommitSha: 'abcdef123456',
            sourceCommitUrl: 'https://github.com/antfu/skills/commit/abcdef123456',
            skillFileUrl: null,
            historyUrl: null,
            modifiedAt: Date.parse('2026-05-23T01:09:07.000Z') / 1000,
            referencesCount: 0,
            lastSyncedAt: Date.parse('2026-08-22T02:02:47.000Z') / 1000,
            syncStatus: 'ok',
          },
        },
      },
    )

    const titles = wrapper.findAll('[title]').map(node => node.attributes('title'))
    expect(titles).toContain('22/08/2026, 02:02:47 UTC')
    expect(titles).toContain('23/05/2026, 01:09:07 UTC')

    wrapper.unmount()
  })
})
