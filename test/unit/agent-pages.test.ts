// @vitest-environment node

import { AGENT_PAGES, agentPageById, compareCliVersions, publishedAgentPages, selectAgentSkills, unpublishedAgentPaths } from '../../layers/marketing/app/utils/agent-pages'

describe('agentPageById', () => {
  it('resolves every page from the CLI release that added its target', () => {
    for (const page of AGENT_PAGES)
      expect(agentPageById(page.id, page.cliSince)?.label, page.id).toBe(page.label)
  })

  it('returns nothing for an Agent without a page', () => {
    expect(agentPageById('cline')).toBeUndefined()
  })
})

describe('selectAgentSkills', () => {
  const items = [
    { owner: 'obra', name: 'a' },
    { owner: 'obra', name: 'b' },
    { owner: 'obra', name: 'c' },
    { owner: 'mattpocock', name: 'd' },
    { owner: 'anthropics', name: 'e' },
    { owner: 'obra', name: 'f' },
  ]

  it('caps one owner so several authors stay on the page', () => {
    const picked = selectAgentSkills(items, { max: 8, perOwner: 2 })
    expect(picked.map(item => item.name)).toEqual(['a', 'b', 'd', 'e'])
  })

  it('stops at the shortlist size in ranked order', () => {
    const picked = selectAgentSkills(items, { max: 2, perOwner: 1 })
    expect(picked.map(item => item.name)).toEqual(['a', 'd'])
  })
})

describe('publishedAgentPages', () => {
  it('holds back a page until the published CLI accepts its --agent value', () => {
    const ids = publishedAgentPages('3.0.0-beta.3').map(page => page.id)
    expect(ids).not.toContain('openclaw')
    expect(ids).not.toContain('hermes')
    expect(ids).toContain('claude-code')
  })

  it('publishes the page once that release ships', () => {
    const ids = publishedAgentPages('3.0.0-beta.4').map(page => page.id)
    expect(ids).toContain('openclaw')
    expect(ids).toContain('hermes')
  })

  it('lists held pages for the sitemap and 404s them by id', () => {
    expect(unpublishedAgentPaths('3.0.0-beta.3')).toEqual(['/agents/openclaw', '/agents/hermes'])
    expect(agentPageById('openclaw', '3.0.0-beta.3')).toBeUndefined()
    expect(agentPageById('openclaw', '3.0.0')?.label).toBe('OpenClaw')
  })
})

describe('compareCliVersions', () => {
  it('orders prerelease numbers numerically and stable after prerelease', () => {
    expect(compareCliVersions('3.0.0-beta.4', '3.0.0-beta.3')).toBeGreaterThan(0)
    expect(compareCliVersions('3.0.0-beta.10', '3.0.0-beta.9')).toBeGreaterThan(0)
    expect(compareCliVersions('3.0.0', '3.0.0-beta.9')).toBeGreaterThan(0)
    expect(compareCliVersions('3.0.1-beta.1', '3.0.0')).toBeGreaterThan(0)
    expect(compareCliVersions('3.0.0-beta.3', '3.0.0-beta.3')).toBe(0)
  })
})
