import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import SkillCard from '../../app/components/SkillCard.vue'

const skill = {
  owner: 'antfu',
  repo: 'skills',
  name: 'nuxt',
  slug: 'antfu/skills/nuxt',
  description: 'Build full-stack Vue applications with Nuxt.',
  stars: 1234,
  modifiedAt: 1_700_000_000,
}

// LikeButton owns its own auth and fetch wiring; stubbing it keeps this file
// about what SkillCard decides to render.
const mountOptions = {
  global: { stubs: { LikeButton: { template: '<span data-testid="like-button" />' } } },
}

function mountCard(props: Record<string, unknown>) {
  return mountSuspended(SkillCard, { ...mountOptions, props: { skill, ...props } })
}

describe('skillCard variants', () => {
  it('defaults to the grid variant', async () => {
    const wrapper = await mountCard({})

    expect(wrapper.get('a').attributes('aria-label')).toBe('/nuxt by antfu')

    wrapper.unmount()
  })

  it('drops the owner from the condensed link label, since the row already sits under one owner', async () => {
    const condensed = await mountCard({ variant: 'condensed' })
    const grid = await mountCard({ variant: 'grid' })

    expect(condensed.get('a').attributes('aria-label')).toBe('/nuxt')
    expect(grid.get('a').attributes('aria-label')).toBe('/nuxt by antfu')

    condensed.unmount()
    grid.unmount()
  })

  it('suppresses the repeated owner path in condensed mode even when asked for it', async () => {
    const condensed = await mountCard({ variant: 'condensed', showOwnerPath: true })
    const grid = await mountCard({ variant: 'grid', showOwnerPath: true })

    expect(condensed.text()).not.toContain('antfu')
    expect(grid.text()).toContain('antfu')

    condensed.unmount()
    grid.unmount()
  })

  it('omits the heart in condensed mode, which reserves no room for a second control', async () => {
    const condensed = await mountCard({ variant: 'condensed' })
    const grid = await mountCard({ variant: 'grid' })

    expect(condensed.find('[data-testid="like-button"]').exists()).toBe(false)
    expect(grid.find('[data-testid="like-button"]').exists()).toBe(true)

    condensed.unmount()
    grid.unmount()
  })

  it('honours showLike: false on a variant that would otherwise show the heart', async () => {
    const wrapper = await mountCard({ variant: 'grid', showLike: false })

    expect(wrapper.find('[data-testid="like-button"]').exists()).toBe(false)

    wrapper.unmount()
  })
})

describe('skillCard signal', () => {
  it('reports GitHub stars, and nothing else, as the automatic signal', async () => {
    const wrapper = await mountCard({})

    const signal = wrapper.get('[title$="GitHub stars"]')
    expect(signal.attributes('title')).toBe('1,234 GitHub stars')
    expect(wrapper.text()).not.toContain('installs')

    wrapper.unmount()
  })

  it('shows no signal for an unstarred skill', async () => {
    const wrapper = await mountSuspended(SkillCard, {
      ...mountOptions,
      props: { skill: { ...skill, stars: 0 } },
    })

    expect(wrapper.find('[title$="GitHub stars"]').exists()).toBe(false)

    wrapper.unmount()
  })

  it('can be switched off entirely', async () => {
    const wrapper = await mountCard({ signal: 'none' })

    expect(wrapper.find('[title$="GitHub stars"]').exists()).toBe(false)

    wrapper.unmount()
  })
})

describe('skillCard timestamps', () => {
  it('renders a machine-readable time element rather than a server-formatted string', async () => {
    const wrapper = await mountCard({ variant: 'grid', timestampLabel: 'Updated' })

    const time = wrapper.get('time')
    expect(time.attributes('datetime')).toBe(new Date(1_700_000_000 * 1000).toISOString())

    wrapper.unmount()
  })

  it('defaults condensed rows to a relative time and grid cards to an absolute date', async () => {
    const condensed = await mountCard({ variant: 'condensed', timestampLabel: 'Updated' })
    const grid = await mountCard({ variant: 'grid', timestampLabel: 'Updated' })

    expect(condensed.get('time').text()).toMatch(/ago$/)
    expect(grid.get('time').text()).toMatch(/^\w+ \d+, \d{4}$/)

    condensed.unmount()
    grid.unmount()
  })

  it('lets a caller override the format the variant would pick', async () => {
    const wrapper = await mountCard({
      variant: 'condensed',
      timestampLabel: 'Updated',
      timestampFormat: 'absolute',
    })

    expect(wrapper.get('time').text()).toMatch(/^\w+ \d+, \d{4}$/)

    wrapper.unmount()
  })
})
