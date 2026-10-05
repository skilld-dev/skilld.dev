import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { homepagePersonSkillFallbacks } from '../../app/data/homepage-person-skills'
import {
  HOMEPAGE_SKILL_LIMIT,
  HOMEPAGE_TRENDING_MINIMUM,
  selectHomepagePersonSkills,
  selectHomepageTrendingSkills,
} from '../../app/utils/homepage-person-skills'

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

  it('ships twenty person-authored homepage fallbacks', () => {
    expect(homepagePersonSkillFallbacks).toHaveLength(20)
    expect(new Set(homepagePersonSkillFallbacks.map(skill => skill.owner)).size).toBeGreaterThanOrEqual(10)
    expect([...Map.groupBy(homepagePersonSkillFallbacks, skill => skill.owner).values()]
      .every(skills => skills.length <= 2)).toBe(true)
    expect(homepagePersonSkillFallbacks.every(skill => skill.maintainerName)).toBe(true)
    expect(homepagePersonSkillFallbacks.every(skill => skill.displayName === skill.name)).toBe(true)
  })

  it('shows one skill per person from the live feed', () => {
    const sections = Array.from({ length: 12 }, (_, personIndex) => ({
      owner: `person-${personIndex}`,
      repo: 'skills',
      displayName: `Person ${personIndex}`,
      skills: Array.from({ length: 5 }, (_, skillIndex) => ({
        owner: `person-${personIndex}`,
        repo: 'skills',
        name: `skill-${skillIndex}`,
        displayName: `Skill ${skillIndex}`,
        description: null,
        stars: 100 - skillIndex,
        registryPath: `/gh/person-${personIndex}/skills/skill-${skillIndex}`,
      })),
    }))
    const selected = selectHomepagePersonSkills(sections, new Map())

    expect(selected).toHaveLength(12)
    expect(new Set(selected.map(skill => skill.owner)).size).toBe(12)
    // The most-starred skill represents each person.
    expect(selected.every(skill => skill.name === 'skill-0')).toBe(true)
  })

  it('keeps one skill per author in the trending rail and pads it with fallbacks', () => {
    // Three authors with five skills each, the shape a multi-skill repository produces.
    const items = Array.from({ length: 45 }, (_, index) => ({
      ...homepagePersonSkillFallbacks[0]!,
      owner: `author-${index % 9}`,
      name: `trending-${index}`,
      displayName: `Trending ${index}`,
    }))

    const selection = selectHomepageTrendingSkills(items, homepagePersonSkillFallbacks)
    expect(selection._tag).toBe('trending')
    if (selection._tag !== 'trending')
      return

    const owners = selection.items.map(skill => skill.owner)
    expect(new Set(owners).size).toBe(owners.length)
    expect(owners.slice(0, 9)).toEqual(Array.from({ length: 9 }, (_, index) => `author-${index}`))
    expect(selection.items.length).toBeGreaterThan(9)
    expect(selection.items.length).toBeLessThanOrEqual(HOMEPAGE_SKILL_LIMIT)
  })

  it('asks for fallback skills when too few authors are trending', () => {
    const items = Array.from({ length: 30 }, (_, index) => ({
      ...homepagePersonSkillFallbacks[0]!,
      owner: `author-${index % (HOMEPAGE_TRENDING_MINIMUM - 1)}`,
      name: `trending-${index}`,
    }))

    expect(selectHomepageTrendingSkills(items, homepagePersonSkillFallbacks)).toEqual({ _tag: 'fallback' })
  })

  it('attributes trending skills to repository maintainers', () => {
    const items = Array.from({ length: HOMEPAGE_TRENDING_MINIMUM }, (_, index) => ({
      owner: index === 0 ? 'addyosmani' : `author-${index}`,
      repo: 'skills',
      name: 'api-and-interface-design',
      displayName: 'API and interface design',
      registryPath: `/gh/${index === 0 ? 'addyosmani' : `author-${index}`}/skills/api-and-interface-design`,
      maintainerName: 'Yarchi',
    }))

    const selection = selectHomepageTrendingSkills(items, homepagePersonSkillFallbacks)
    expect(selection._tag).toBe('trending')
    if (selection._tag !== 'trending')
      return

    expect(selection.items[0]?.maintainerName).toBe('Addy Osmani')
    expect(selection.items[1]?.maintainerName).toBe('author-1')
  })

  it('preserves a focused item until live data can replace it safely', async () => {
    const container = document.createElement('div')
    const outsideButton = document.createElement('button')
    document.body.append(container, outsideButton)

    const initialItems = homepagePersonSkillFallbacks.slice(0, 2)
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
          items: homepagePersonSkillFallbacks.slice(0, 2),
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
