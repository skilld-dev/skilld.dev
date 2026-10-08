import { describe, expect, it } from 'vitest'
import { codexDemoTokenUsage } from '../../shared/demo-usage'

describe('codexDemoTokenUsage', () => {
  it('sums completed turns and keeps cached input inside total input', () => {
    const events = [
      { type: 'item.completed' },
      { type: 'turn.completed', usage: { input_tokens: 100, cached_input_tokens: 80, output_tokens: 20 } },
      { type: 'turn.completed', usage: { input_tokens: 50, cached_input_tokens: 30, output_tokens: 10 } },
    ].map(event => JSON.stringify(event)).join('\n')
    expect(codexDemoTokenUsage(events)).toEqual({ inputTokens: 150, cachedInputTokens: 110, outputTokens: 30 })
  })
  it('leaves recordings without completed usage unknown', () => {
    expect(codexDemoTokenUsage('{"type":"turn.started"}\n')).toBeNull()
  })
  it('rejects impossible cached counts', () => {
    expect(() => codexDemoTokenUsage('{"type":"turn.completed","usage":{"input_tokens":10,"cached_input_tokens":20,"output_tokens":1}}')).toThrow()
  })
})
