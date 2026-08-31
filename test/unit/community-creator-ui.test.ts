import type { CommunityDirectoryItem } from '../../server/utils/community'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import CommunityCreator from '../../app/components/community/_CommunityCreator.vue'

function creatorFixture(overrides: Partial<CommunityDirectoryItem> = {}): CommunityDirectoryItem {
  return {
    id: 1,
    login: 'harlan-zw',
    name: 'Harlan Wilton',
    avatar: 'https://github.com/harlan-zw.png',
    collectionCount: 3,
    skillCount: 12,
    featured: false,
    activityAt: 1_700_000_000,
    topCollection: {
      authorLogin: 'harlan-zw',
      slug: 'design-engineering-essentials',
      name: 'Design Engineering Essentials',
      preamble: 'The skills a design engineer reaches for daily.',
      skillCount: 8,
      skills: [
        { owner: 'antfu', repo: 'skills', name: 'nuxt', displayName: 'Nuxt' },
        { owner: 'antfu', repo: 'skills', name: 'unocss', displayName: null },
      ],
      updatedAt: 1_700_000_000,
    },
    topSkill: {
      owner: 'antfu',
      repo: 'skills',
      name: 'nuxt',
      displayName: 'Nuxt',
      description: 'Build full-stack Vue applications.',
      stars: 1200,
      modifiedAt: 1_700_000_000,
      registryPath: '/gh/antfu/skills/nuxt',
    },
    ...overrides,
  } as CommunityDirectoryItem
}

function mountCreator(overrides: Partial<CommunityDirectoryItem> = {}) {
  return mountSuspended(CommunityCreator, { props: { creator: creatorFixture(overrides) } })
}

describe('community creator identity', () => {
  it('links the display name to the profile and shows the login alongside it', async () => {
    const wrapper = await mountCreator()

    const profile = wrapper.get('a[href="/@harlan-zw"]')
    expect(profile.attributes('aria-label')).toBe('View Harlan Wilton\'s profile')
    expect(profile.text()).toContain('Harlan Wilton')
    expect(profile.text()).toContain('@harlan-zw')

    wrapper.unmount()
  })

  it('falls back to the login as the display name without repeating it underneath', async () => {
    const wrapper = await mountCreator({ name: null })

    const profile = wrapper.get('a[href="/@harlan-zw"]')
    expect(profile.text().match(/@harlan-zw/g)).toHaveLength(1)

    wrapper.unmount()
  })

  it('summarises contributions with singular and plural units', async () => {
    const plural = await mountCreator()
    expect(plural.text()).toContain('3 collections · 12 skills')
    plural.unmount()

    const singular = await mountCreator({ collectionCount: 1, skillCount: 1 })
    expect(singular.text()).toContain('1 collection · 1 skill')
    singular.unmount()

    const skillsOnly = await mountCreator({ collectionCount: 0, topCollection: null })
    expect(skillsOnly.text()).toContain('12 skills')
    expect(skillsOnly.text()).not.toContain('·')
    skillsOnly.unmount()
  })
})

describe('community creator collection preview', () => {
  it('lists the previewed collection skills in order as a real list', async () => {
    const wrapper = await mountCreator()

    const items = wrapper.findAll('.community-contribution__skill-list li')
    expect(items.map(item => item.text())).toEqual(['Nuxt', 'unocss'])
    expect(wrapper.get('.community-contribution__skill-list').element.tagName).toBe('UL')
    expect(wrapper.html()).not.toMatch(/role="list(item)?"/)

    wrapper.unmount()
  })

  it('reports how many skills the preview left out', async () => {
    const wrapper = await mountCreator()

    expect(wrapper.text()).toContain('+6 more')

    wrapper.unmount()
  })

  it('drops the overflow note when the preview shows the whole collection', async () => {
    const wrapper = await mountCreator({
      topCollection: { ...creatorFixture().topCollection!, skillCount: 2 },
    })

    expect(wrapper.text()).not.toContain('more')
    expect(wrapper.text()).toContain('2 skills')

    wrapper.unmount()
  })

  it('omits the preview entirely when the collection has no skills to show', async () => {
    const wrapper = await mountCreator({
      topCollection: { ...creatorFixture().topCollection!, skills: [], skillCount: 0 },
    })

    expect(wrapper.find('.community-contribution__skill-preview').exists()).toBe(false)
    expect(wrapper.text()).toContain('0 skills')

    wrapper.unmount()
  })

  it('labels a featured creator\'s collection differently from a latest one', async () => {
    const featured = await mountCreator({ featured: true })
    expect(featured.text()).toContain('Featured collection')
    featured.unmount()

    const latest = await mountCreator({ featured: false })
    expect(latest.text()).toContain('Latest collection')
    latest.unmount()
  })
})

describe('community creator top skill', () => {
  it('links the most popular skill to its canonical page with compact star counts', async () => {
    const wrapper = await mountCreator()

    const link = wrapper.get('a[href="/gh/antfu/skills/nuxt"]')
    expect(link.text()).toContain('Nuxt')
    expect(link.text()).toContain('antfu/skills')
    expect(link.text()).toContain('1.2K GitHub stars')

    wrapper.unmount()
  })

  it('uses the singular star unit and an uncompacted count below a thousand', async () => {
    const wrapper = await mountCreator({
      topSkill: { ...creatorFixture().topSkill!, stars: 1 },
    })

    expect(wrapper.text()).toContain('1 GitHub star')

    wrapper.unmount()
  })

  it('falls back to the raw skill name when it has no display name', async () => {
    const wrapper = await mountCreator({
      topSkill: { ...creatorFixture().topSkill!, displayName: null },
    })

    expect(wrapper.get('a[href="/gh/antfu/skills/nuxt"]').text()).toContain('nuxt')

    wrapper.unmount()
  })

  it('renders neither contribution card when the creator has neither', async () => {
    const wrapper = await mountCreator({ topCollection: null, topSkill: null })

    expect(wrapper.findAll('.community-contribution')).toHaveLength(0)
    expect(wrapper.get('a[href="/@harlan-zw"]').exists()).toBe(true)

    wrapper.unmount()
  })
})
