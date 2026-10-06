import { describe, expect, it } from 'vitest'
import { AGENT_REACH } from '../../app/utils/agent-reach'
import { publishedAgentPages } from '../../layers/marketing/app/utils/agent-pages'

describe('aGENT_REACH', () => {
  it('links every CLI Agent tile to a published agent page', () => {
    const published = new Set(publishedAgentPages().map(page => `/agents/${page.id}`))
    for (const agent of AGENT_REACH.filter(agent => agent.via === 'CLI'))
      expect(published.has(agent.to), agent.to).toBe(true)
  })
})
