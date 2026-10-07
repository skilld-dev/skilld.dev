import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

const sourceItems = [
  { owner: 'antfu', repo: 'skills', name: 'vite', displayName: 'vite', registryPath: '/gh/antfu/skills/vite', maintainerName: 'Anthony Fu' },
  { owner: 'addyosmani', repo: 'agent-skills', name: 'api-and-interface-design', displayName: 'api-and-interface-design', registryPath: '/gh/addyosmani/agent-skills/api-and-interface-design', maintainerName: 'Addy Osmani' },
]

describe('skill source list', () => {
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
})
