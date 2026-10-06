import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import RepoSkillDependencies from '../../layers/registry/app/pages/gh/[owner]/[repo]/_RepoSkillDependencies.vue'

// UTooltip needs a TooltipProvider ancestor that only the app shell installs; the
// stub keeps its text observable without mounting the shell.
const mountOptions = {
  global: {
    stubs: {
      UTooltip: { props: ['text'], template: '<div :data-tooltip="text"><slot /></div>' },
    },
  },
}

function mountDependencies(dependencies: string[]) {
  return mountSuspended(RepoSkillDependencies, {
    ...mountOptions,
    props: { owner: 'antfu', repo: 'skills', dependencies },
  })
}

function links(wrapper: Awaited<ReturnType<typeof mountDependencies>>) {
  return wrapper.findAll('a').map(link => ({ text: link.text(), href: link.attributes('href') }))
}

describe('repository skill dependency links', () => {
  it('links each dependency to its canonical skill page', async () => {
    const wrapper = await mountDependencies(['tailwind', 'typescript'])

    expect(wrapper.text()).toContain('Requires')
    expect(links(wrapper)).toEqual([
      { text: '/tailwind', href: '/gh/antfu/skills/tailwind' },
      { text: '/typescript', href: '/gh/antfu/skills/typescript' },
    ])

    wrapper.unmount()
  })

  it('caps visible dependencies at three and summarises the rest behind one control', async () => {
    const wrapper = await mountDependencies(['a', 'b', 'c', 'd', 'e'])

    expect(links(wrapper).map(link => link.text)).toEqual(['/a', '/b', '/c'])
    const overflow = wrapper.get('[aria-label$="more dependencies: /d, /e"]')
    expect(overflow.text()).toBe('+2')
    expect(overflow.attributes('aria-label')).toBe('2 more dependencies: /d, /e')
    expect(wrapper.get('[data-tooltip]').attributes('data-tooltip')).toBe('/d, /e')

    wrapper.unmount()
  })

  it('shows no overflow control when every dependency fits', async () => {
    const wrapper = await mountDependencies(['a', 'b', 'c'])

    expect(wrapper.find('[aria-label$="more dependencies"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('+')

    wrapper.unmount()
  })
})
