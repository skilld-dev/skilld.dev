import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import SkillOgImage from '../../app/components/OgImage/Skill.takumi.vue'

const stubs = {
  OgLayout: { template: '<div><slot /></div>' },
  OgBrand: { template: '<div />' },
}

describe('skill OG image', () => {
  it('shows the display name and owner avatar without an install command', async () => {
    const component = await mountSuspended(SkillOgImage, {
      props: {
        name: 'vue-best-practices',
        displayName: 'Vue Best Practices',
        owner: 'hyf0',
        repo: 'skills',
        ownerAvatar: 'https://github.com/hyf0.png?size=128',
      },
      global: { stubs },
    })

    expect(component.text()).toContain('Vue Best Practices')
    expect(component.text()).not.toContain('skilld add')
    expect(component.get('img[alt="hyf0"]').attributes()).toMatchObject({
      src: 'https://github.com/hyf0.png?size=128',
      alt: 'hyf0',
    })
  })
})
