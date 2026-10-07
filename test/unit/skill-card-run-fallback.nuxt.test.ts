import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SkillCard from '../../app/components/SkillCard.vue'

// The clipboard is the boundary: a browser can refuse the write, and the card
// must still hand the visitor the command.
mockNuxtImport('useInstallCopy', () => () => ({
  copy: async () => ({ _tag: 'error', message: 'Could not copy.' }),
  copied: ref(false),
  isSupported: ref(true),
}))

const skill = { owner: 'antfu', repo: 'skills', name: 'vite', registryPath: '/gh/antfu/skills/vite' }

describe('skill card run pill', () => {
  it('shows the run command for a manual copy when the clipboard refuses', async () => {
    const wrapper = await mountSuspended(SkillCard, { props: { skill } })

    const pill = wrapper.findAll('button').find(button => button.text().includes('Copy run command for /vite'))
    expect(wrapper.text()).not.toContain('npx skilld run antfu/skills/vite')

    await pill!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('npx skilld run antfu/skills/vite')
    expect(wrapper.text()).toContain('Selected. Copy it with your keyboard.')

    wrapper.unmount()
  })
})
