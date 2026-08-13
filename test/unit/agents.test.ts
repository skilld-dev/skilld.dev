import { describe, expect, it } from 'vitest'
import {
  AGENT_TARGETS,
  agentInstallCmd,
  FEATURED_AGENT_TARGETS,
  oncePromptFor,
  skillDocUrl,
} from '../../app/utils/agents'

describe('agentInstallCmd', () => {
  const base = 'npx skilld add gh:obra/superpowers -s brainstorming'

  it('pins the agent for a project install', () => {
    expect(agentInstallCmd(base, 'cursor', 'project'))
      .toBe(`${base} --agent cursor`)
  })

  it('adds the global flag after the agent flag', () => {
    expect(agentInstallCmd(base, 'claude-code', 'global'))
      .toBe(`${base} --agent claude-code -g`)
  })

  it('leaves the command untouched for one-off use, which installs nothing', () => {
    expect(agentInstallCmd(base, 'codex', 'once')).toBe(base)
  })
})

describe('oncePromptFor', () => {
  it('tells the agent to read and follow the published skill', () => {
    expect(oncePromptFor('https://skilld.dev/api/skills-raw/obra/superpowers/brainstorming'))
      .toBe('Read https://skilld.dev/api/skills-raw/obra/superpowers/brainstorming and follow it.')
  })
})

describe('skillDocUrl', () => {
  it('points at the pristine SKILL.md endpoint, which serves text/markdown', () => {
    expect(skillDocUrl('obra', 'superpowers', 'brainstorming'))
      .toBe('https://skilld.dev/api/skills-raw/obra/superpowers/brainstorming')
  })
})

describe('agent registry', () => {
  it('shows a small enough row to scan at a glance', () => {
    expect(FEATURED_AGENT_TARGETS.length).toBeLessThanOrEqual(4)
  })

  it('gives every agent the fields the setup panel renders', () => {
    for (const agent of AGENT_TARGETS) {
      expect(agent.projectDir, agent.id).toMatch(/^\.[\w-]+\/skills$/)
      expect(agent.globalDir, agent.id).toMatch(/^~\//)
      expect(agent.verify.length, agent.id).toBeGreaterThan(0)
      expect(agent.icon, agent.id).toMatch(/^i-/)
    }
  })

  it('keeps agent ids unique so telemetry buckets cleanly', () => {
    const ids = AGENT_TARGETS.map(agent => agent.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
