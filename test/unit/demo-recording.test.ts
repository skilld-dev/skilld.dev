import { describe, expect, it } from 'vitest'
import { demoAgentIcon, demoModelLabel } from '../../shared/demo-recording'

describe('demoModelLabel', () => {
  it('reads a Claude model id as its family and version', () => {
    expect(demoModelLabel('claude-opus-5-5')).toBe('Opus 5.5')
    expect(demoModelLabel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
  })

  it('prints any other model id as recorded', () => {
    expect(demoModelLabel('gpt-6-luna')).toBe('gpt-6-luna')
  })
})

describe('demoAgentIcon', () => {
  it('falls back to a generic icon for an Agent it does not know', () => {
    expect(demoAgentIcon('Claude Code')).toBe('i-simple-icons-claude')
    expect(demoAgentIcon('Some Agent')).toBe('i-lucide-bot')
  })
})
