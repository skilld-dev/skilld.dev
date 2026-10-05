import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import SkillCommandPanel from '../../layers/registry/app/components/_SkillCommandPanel.vue'

const props = {
  runUrl: 'https://skilld.dev/gh/antfu/skills/vue',
  installCommand: 'npx skilld install antfu/skills/vue',
  runCopied: false,
  installCopied: false,
  copyError: '',
  layout: 'stacked' as const,
  modelValue: 'run' as const,
}

describe('skill command panel registry setup link', () => {
  it.each(['stacked', 'tabs'] as const)('offers the fork workflow in the %s layout', async (layout) => {
    const wrapper = await mountSuspended(SkillCommandPanel, { props: { ...props, layout } })
    const forkLink = wrapper.findAll('a').find(link => link.text() === 'Fork this Skill')

    expect(forkLink?.attributes('href')).toBe(`${props.runUrl}.md`)
    expect(wrapper.text()).toContain('A fork creates an editable local Skill with its original author and licence.')
  })

  it('points each install tab at the matching developers setup', async () => {
    const wrapper = await mountSuspended(SkillCommandPanel, { props })
    const setupHref = () => wrapper.findAll('a').map(a => a.attributes('href')).find(href => href?.startsWith('/developers'))

    expect(setupHref()).toBe('/developers')

    for (const [label, href] of [['Claude', '/developers?setup=mcp&app=claude'], ['ChatGPT', '/developers?setup=mcp&app=chatgpt']] as const) {
      const tab = wrapper.findAll('button').find(button => button.text() === label)!
      await tab.trigger('click')
      expect(setupHref()).toBe(href)
    }
  })
})
