// @vitest-environment node

import { AGENT_PAGES, agentPageById, selectAgentSkills } from '../../layers/marketing/app/utils/agent-pages'

describe('agentPageById', () => {
  it('resolves every CLI id the pages ship for', () => {
    for (const page of AGENT_PAGES)
      expect(agentPageById(page.id)?.label, page.id).toBe(page.label)
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
