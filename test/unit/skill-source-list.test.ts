import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

const sourceItems = [
  { owner: 'antfu', repo: 'skills', name: 'vite', displayName: 'vite', registryPath: '/gh/antfu/skills/vite', maintainerName: 'Anthony Fu' },
  { owner: 'addyosmani', repo: 'agent-skills', name: 'api-and-interface-design', displayName: 'api-and-interface-design', registryPath: '/gh/addyosmani/agent-skills/api-and-interface-design', maintainerName: 'Addy Osmani' },
]

describe('skill source list', () => {
  it('links to the canonical Skill path supplied by the server', async () => {
    const wrapper = await mountSuspended(
      await import('../../app/components/SkillSourceList.vue').then(module => module.default),
      {
        props: {
          items: [{
            owner: 'tt-a1i',
            repo: 'archify',
            name: 'archify',
            displayName: 'Archify',
            registryPath: '/gh/tt-a1i/archify',
          }],
          variant: 'stream',
        },
      },
    )

    expect(wrapper.get('a').attributes('href')).toBe('/gh/tt-a1i/archify')

    wrapper.unmount()
  })

  it('preserves a focused item until live data can replace it safely', async () => {
    const container = document.createElement('div')
    const outsideButton = document.createElement('button')
    document.body.append(container, outsideButton)

    const initialItems = sourceItems
    const liveItems = initialItems.map((item, index) => ({
      ...item,
      name: `live-skill-${index}`,
      displayName: `Live skill ${index}`,
    }))
    const wrapper = await mountSuspended(
      await import('../../app/components/SkillSourceList.vue').then(module => module.default),
      {
        attachTo: container,
        props: {
          items: initialItems,
          variant: 'stream',
          ariaLabel: 'Person-authored skills',
        },
      },
    )

    try {
      const focusedLink = wrapper.get('a').element as HTMLAnchorElement
      focusedLink.focus()
      await nextTick()
      await wrapper.setProps({ items: liveItems })

      expect(document.activeElement).toBe(focusedLink)
      expect(wrapper.text()).toContain(initialItems[0]!.displayName)
      expect(wrapper.text()).not.toContain(liveItems[0]!.displayName)

      outsideButton.focus()
      await nextTick()

      expect(wrapper.text()).toContain(liveItems[0]!.displayName)
    }
    finally {
      wrapper.unmount()
      container.remove()
      outsideButton.remove()
    }
  })

  it('uses semantic lists without an extra focus target', async () => {
    const wrapper = await mountSuspended(
      await import('../../app/components/SkillSourceList.vue').then(module => module.default),
      {
        props: {
          items: sourceItems,
          variant: 'stream',
          ariaLabel: 'Person-authored skills',
        },
      },
    )

    const stream = wrapper.get('[data-testid="skill-source-stream"]')
    expect(stream.attributes('tabindex')).toBeUndefined()
    expect(stream.attributes('aria-label')).toBeUndefined()
    expect(wrapper.get('ul').element.tagName).toBe('UL')
    expect(wrapper.get('ul').attributes('aria-label')).toBe('Person-authored skills')
    expect(wrapper.findAll('ul > li')).toHaveLength(2)

    wrapper.unmount()
  })
})
