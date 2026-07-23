import { describe, expect, it, vi } from 'vitest'
import { summariseChanges } from '../../layers/identity/server/utils/digest-summary'

describe('digest summary', () => {
  it('returns an explicit provider fallback instead of silently swallowing failure', async () => {
    const result = await summariseChanges({
      ai: {
        run: vi.fn(async () => {
          throw new Error('AI unavailable')
        }),
      },
      subscriptions: [{
        owner: 'acme',
        repo: 'skills',
        skills: [{ name: 'alpha', description: 'Alpha', changeCount: 2 }],
      }],
      changes: [{
        owner: 'acme',
        repo: 'skills',
        totalChangeCount: 2,
        skills: [{ name: 'alpha', changeCount: 2, commitMessages: ['one', 'two'] }],
        diffExcerpt: '',
      }],
    })

    expect(result).toEqual({
      _tag: 'fallback',
      reason: 'provider_failure',
      error: 'AI unavailable',
    })
  })

  it('rejects malformed provider JSON at the boundary', async () => {
    const result = await summariseChanges({
      ai: {
        run: vi.fn(async () => ({
          content: [{ type: 'text', text: `{"summaries":[null]}` }],
        })),
      },
      subscriptions: [{
        owner: 'acme',
        repo: 'skills',
        skills: [{ name: 'alpha', description: 'Alpha', changeCount: 1 }],
      }],
      changes: [{
        owner: 'acme',
        repo: 'skills',
        totalChangeCount: 1,
        skills: [{ name: 'alpha', changeCount: 1, commitMessages: ['one'] }],
        diffExcerpt: '',
      }],
    })

    expect(result).toEqual({ _tag: 'fallback', reason: 'invalid_response' })
  })
})
