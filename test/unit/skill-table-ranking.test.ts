import { mountSuspended } from '@nuxt/test-utils/runtime'

describe('skill table ranking signal', () => {
  it('shows likes when the table is ranked by likes', async () => {
    const wrapper = await mountSuspended(
      await import('../../app/components/SkillTable.vue').then(module => module.default),
      {
        props: {
          metric: 'likes',
          skills: [{
            owner: 'antfu',
            repo: 'skills',
            name: 'nuxt',
            slug: 'antfu/skills/nuxt',
            description: 'Nuxt framework guidance.',
            stars: 12_000,
            likeCount: 7,
          }],
        },
      },
    )

    expect(wrapper.get('.skill-table__metric-heading').text()).toBe('Likes')
    expect(wrapper.get('.skill-table__metric').text()).toBe('7')

    wrapper.unmount()
  })
})
