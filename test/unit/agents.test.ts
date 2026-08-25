import { describe, expect, it } from 'vitest'
import { AGENT_TARGETS, skillDocUrl } from '../../app/utils/agents'

describe('skillDocUrl', () => {
  it('points at the pristine SKILL.md endpoint, which serves text/markdown', () => {
    expect(skillDocUrl('obra', 'superpowers', 'brainstorming'))
      .toBe('https://skilld.dev/api/skills-raw/obra/superpowers/brainstorming')
  })
})

describe('agent registry', () => {
  it('tells every agent how to confirm the install landed', () => {
    for (const agent of AGENT_TARGETS) {
      expect(agent.label.length, agent.id).toBeGreaterThan(0)
      expect(agent.verify.length, agent.id).toBeGreaterThan(0)
    }
  })

  it('keeps agent ids unique so the rendered list has stable keys', () => {
    const ids = AGENT_TARGETS.map(agent => agent.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
