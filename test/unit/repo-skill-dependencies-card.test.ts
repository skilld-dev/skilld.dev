import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import RepoSkillCard from '../../layers/registry/app/pages/gh/[owner]/[repo]/_RepoSkillCard.vue'

const baseSkill = {
  owner: 'antfu',
  repo: 'skills',
  name: 'nuxt',
  description: 'Build full-stack Vue applications with Nuxt.',
  modifiedAt: 1_700_000_000,
}

// LikeButton owns its own auth and fetch wiring, and is not what this card decides.
// UTooltip needs a TooltipProvider ancestor that only the app shell installs; the
// stub keeps its text observable without mounting the shell.
const mountOptions = {
  global: {
    stubs: {
      LikeButton: { template: '<span data-testid="like-button" />' },
      UTooltip: { props: ['text'], template: '<div :data-tooltip="text"><slot /></div>' },
    },
  },
}

function mountCard(skill: Record<string, unknown>) {
  return mountSuspended(RepoSkillCard, { ...mountOptions, props: { skill: { ...baseSkill, ...skill } } })
}

function dependencyLinks(wrapper: Awaited<ReturnType<typeof mountCard>>) {
  return wrapper.findAll('a')
    .filter(link => link.attributes('aria-label') === undefined)
    .map(link => ({ text: link.text(), href: link.attributes('href') }))
}

describe('repository skill dependency links', () => {
  it('links each dependency to its canonical skill page', async () => {
    const wrapper = await mountCard({ dependencies: ['tailwind', 'typescript'] })

    expect(wrapper.text()).toContain('Requires')
    expect(dependencyLinks(wrapper)).toEqual([
      { text: '/tailwind', href: '/gh/antfu/skills/tailwind' },
      { text: '/typescript', href: '/gh/antfu/skills/typescript' },
    ])

    wrapper.unmount()
  })

  it('keeps dependency links outside the card-wide primary link so they stay clickable', async () => {
    const wrapper = await mountCard({ dependencies: ['tailwind'] })

    const primary = wrapper.get('a[aria-label="/nuxt"]')
    const dependency = wrapper.get('a[href="/gh/antfu/skills/tailwind"]')

    expect(primary.element.contains(dependency.element)).toBe(false)
    expect(dependency.classes()).toContain('pointer-events-auto')

    wrapper.unmount()
  })

  it('caps visible dependencies at three and summarises the rest behind one control', async () => {
    const wrapper = await mountCard({
      dependencies: ['a', 'b', 'c', 'd', 'e'],
    })

    expect(dependencyLinks(wrapper).map(link => link.text)).toEqual(['/a', '/b', '/c'])
    const overflow = wrapper.get('[aria-label$="more dependencies: /d, /e"]')
    expect(overflow.text()).toBe('+2')
    expect(overflow.attributes('aria-label')).toBe('2 more dependencies: /d, /e')
    expect(wrapper.get('[data-tooltip]').attributes('data-tooltip')).toBe('/d, /e')

    wrapper.unmount()
  })

  it('shows no overflow control when every dependency fits', async () => {
    const wrapper = await mountCard({ dependencies: ['a', 'b', 'c'] })

    expect(wrapper.find('[aria-label$="more dependencies"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('+')

    wrapper.unmount()
  })

  it('omits the whole metadata footer when there is nothing to report', async () => {
    const wrapper = await mountCard({ dependencies: [], modifiedAt: null })

    expect(wrapper.text()).not.toContain('Requires')
    expect(wrapper.find('time').exists()).toBe(false)

    wrapper.unmount()
  })
})

describe('repository skill card metadata', () => {
  it('reports a per-skill update time as a relative machine-readable value', async () => {
    const wrapper = await mountCard({})

    const time = wrapper.get('time')
    expect(time.attributes('datetime')).toBe(new Date(1_700_000_000 * 1000).toISOString())
    expect(time.text()).toMatch(/^Updated .+ago$/)
    expect(wrapper.text()).not.toContain('Added')

    wrapper.unmount()
  })

  it('ignores an unusable timestamp instead of rendering an invalid date', async () => {
    const wrapper = await mountCard({ modifiedAt: 0 })

    expect(wrapper.find('time').exists()).toBe(false)

    wrapper.unmount()
  })

  it('carries no repo-level trust or star metadata', async () => {
    const wrapper = await mountCard({ dependencies: ['tailwind'] })

    expect(wrapper.text()).not.toMatch(/stars?/i)
    expect(wrapper.html()).not.toContain('trustTier')

    wrapper.unmount()
  })
})
