import { describe, expect, it } from 'vitest'
import { demoAgentIcon, demoModelLabel, demoRecordingLabel } from '../../shared/demo-recording'

describe('demoRecordingLabel', () => {
  it('shows the recorded effort with the model', () => {
    expect(demoRecordingLabel('gpt-6.1-sol', 'medium')).toBe('gpt-6.1-sol, medium effort')
  })

  it('does not invent effort for an older recording', () => {
    expect(demoRecordingLabel('claude-opus-5-5', null)).toBe('Opus 5.5')
  })
})

describe('demoModelLabel', () => {
  it('reads a Claude model id as its family and version', () => {
    expect(demoModelLabel('claude-opus-5-5')).toBe('Opus 5.5')
    expect(demoModelLabel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
    expect(demoModelLabel('claude-sonnet-4-6')).toBe('Sonnet 4.6')
    expect(demoModelLabel('claude-opus-4-20250514')).toBe('Opus 4')
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
