import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { homepagePersonSkillFallbacks } from '../../app/data/homepage-person-skills'
import {
  HOMEPAGE_RAIL_MINIMUM,
  HOMEPAGE_SKILL_LIMIT,
  HOMEPAGE_SKILLS_PER_PERSON,
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

  it('caps each person while filling the stream to its limit', () => {
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
    const countsByOwner = Map.groupBy(selected, skill => skill.owner)

    expect(selected).toHaveLength(HOMEPAGE_SKILL_LIMIT)
    expect(countsByOwner.size).toBe(12)
    expect([...countsByOwner.values()]
      .every(skills => skills.length <= HOMEPAGE_SKILLS_PER_PERSON)).toBe(true)
  })

  it('keeps the hero rail deep enough to scroll past the fold', () => {
    expect(HOMEPAGE_SKILL_LIMIT).toBeGreaterThanOrEqual(HOMEPAGE_RAIL_MINIMUM)
  })

  it('caps a dense trending feed before it reaches the hero stream', () => {
    const items = Array.from({ length: 45 }, (_, index) => ({
      ...homepagePersonSkillFallbacks[index % homepagePersonSkillFallbacks.length]!,
      name: `trending-${index}`,
      displayName: `Trending ${index}`,
    }))

    expect(selectHomepageTrendingSkills(items)).toEqual({
      _tag: 'trending',
      items: items.slice(0, HOMEPAGE_SKILL_LIMIT),
    })
  })

  it('asks for fallback skills when the trending feed is thin', () => {
    const items = homepagePersonSkillFallbacks.slice(0, HOMEPAGE_RAIL_MINIMUM - 1)

    expect(selectHomepageTrendingSkills(items)).toEqual({ _tag: 'fallback' })
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
