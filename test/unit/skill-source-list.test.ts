import { readFileSync } from 'node:fs'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { homepagePersonSkillFallbacks } from '../../app/data/homepage-person-skills'
import { selectHomepagePersonSkills } from '../../app/utils/homepage-person-skills'

const componentSource = readFileSync('app/components/SkillSourceList.vue', 'utf8')
const skillDetailSource = readFileSync('layers/registry/app/components/SkillDetail.vue', 'utf8')

describe('skill source list', () => {
  it('ships twenty person-authored homepage fallbacks', () => {
    expect(homepagePersonSkillFallbacks).toHaveLength(20)
    expect(new Set(homepagePersonSkillFallbacks.map(skill => skill.owner)).size).toBeGreaterThanOrEqual(10)
    expect([...Map.groupBy(homepagePersonSkillFallbacks, skill => skill.owner).values()]
      .every(skills => skills.length <= 2)).toBe(true)
    expect(homepagePersonSkillFallbacks.every(skill => skill.maintainerName)).toBe(true)
    expect(homepagePersonSkillFallbacks.every(skill => skill.displayName === skill.name)).toBe(true)
  })

  it('caps each person at two skills while filling the stream', () => {
    const sections = Array.from({ length: 12 }, (_, personIndex) => ({
      owner: `person-${personIndex}`,
      repo: 'skills',
      displayName: `Person ${personIndex}`,
      skills: Array.from({ length: 3 }, (_, skillIndex) => ({
        owner: `person-${personIndex}`,
        repo: 'skills',
        name: `skill-${skillIndex}`,
        displayName: `Skill ${skillIndex}`,
        description: null,
        stars: 100 - skillIndex,
      })),
    }))
    const selected = selectHomepagePersonSkills(sections, new Map())
    const countsByOwner = Map.groupBy(selected, skill => skill.owner)

    expect(selected).toHaveLength(20)
    expect(countsByOwner.size).toBe(12)
    expect([...countsByOwner.values()].every(skills => skills.length <= 2)).toBe(true)
  })

  it('uses native scrolling with guarded idle auto-scroll', () => {
    expect(componentSource).toContain('overflow-y: auto')
    expect(componentSource).toContain('useRafFn')
    expect(componentSource).toContain('useElementHover')
    expect(componentSource).toContain('useFocusWithin')
    expect(componentSource).toContain('usePreferredReducedMotion')
    expect(componentSource).toContain('pauseForManualInput')
    expect(componentSource).toContain('hasFocusedItem')
    expect(componentSource).not.toContain('|| hasFocusWithin.value')
    expect(componentSource).not.toContain('tabindex="0"')
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

  it('reuses the grid variant for related skills', () => {
    expect(skillDetailSource).toContain('<SkillSourceList')
    expect(skillDetailSource).toContain('variant="grid"')
  })
})
