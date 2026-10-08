import type { BehaviorReading } from '../../shared/behavior-readings'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import SkillBehaviors from '../../layers/registry/app/components/_SkillBehaviors.vue'

const behaviors = [
  {
    id: 'remote-code',
    tier: 'ask' as const,
    label: 'Runs code downloaded from the network',
    locations: [
      { path: 'SKILL.md', line: 11, url: null },
      { path: 'SKILL.md', line: 21, url: null },
    ],
    total: 3,
  },
  {
    id: 'packages',
    tier: 'show' as const,
    label: 'Installs or runs packages',
    locations: [{ path: 'SKILL.md', line: 30, url: null }],
    total: 1,
  },
]

const reading: BehaviorReading = {
  path: 'SKILL.md',
  line: 11,
  behavior: 'remote-code',
  lineHash: '00000000',
  verdict: 'quoted-example',
  reason: 'An input to block, in a security guide.',
}

describe('skill behaviors panel', () => {
  it('does not report no match when the rules are unavailable', async () => {
    const wrapper = await mountSuspended(SkillBehaviors, { props: { behaviors: null } })
    expect(wrapper.text()).toContain('Skill behaviors are unavailable.')
    expect(wrapper.text()).not.toContain('No rule matched.')
    wrapper.unmount()
  })

  it('shows a model reading under the match it reads, and says a language model wrote it', async () => {
    const wrapper = await mountSuspended(SkillBehaviors, { props: { behaviors, readings: [reading] } })
    const text = wrapper.text().replace(/\s+/g, ' ')
    const rows = wrapper.findAll('li li').map(row => row.text().replace(/\s+/g, ' '))

    expect(rows).toEqual([
      'SKILL.md:11 · Quoted example. An input to block, in a security guide.',
      'SKILL.md:21',
      '1 more',
    ])
    expect(text).toContain('A language model read each match that needs approval in its context. Its reading is no guarantee and changes no approval.')
    // The approval stays.
    expect(text).toContain('Needs approval')
    wrapper.unmount()
  })

  it('shows no reading and no model note without readings', async () => {
    const wrapper = await mountSuspended(SkillBehaviors, { props: { behaviors } })
    const text = wrapper.text().replace(/\s+/g, ' ')

    expect(text).toContain('SKILL.md:11, SKILL.md:21, 1 more')
    expect(text).not.toContain('language model')
    wrapper.unmount()
  })
})
