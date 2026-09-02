import type { AiBinding } from '../../layers/identity/server/utils/digest-summary'
import { describe, expect, it, vi } from 'vitest'
import { summariseDigestRun } from '../../layers/identity/server/utils/digest-run-summary'
import { resolveDigestSummariser } from '../../layers/identity/server/utils/digest-summary'

describe('paused digest AI summary', () => {
  it('never calls the provider and reports the pause as the fallback reason', async () => {
    const run = vi.fn(async () => ({ content: [{ type: 'text', text: '{"summaries":[]}' }] }))
    const ai: AiBinding = { run }

    const summarise = resolveDigestSummariser({ paused: true, ai })
    const result = await summarise({
      subscriptions: [{
        owner: 'acme',
        repo: 'skills',
        skills: [{ name: 'alpha', description: 'Alpha', changeCount: 2 }],
      }],
      changes: [{
        owner: 'acme',
        repo: 'skills',
        totalChangeCount: 2,
        skills: [{ name: 'alpha', changeCount: 2, commitMessages: ['one'] }],
        diffExcerpt: '',
      }],
    })

    expect(result).toEqual({ _tag: 'fallback', reason: 'paused' })
    expect(run).not.toHaveBeenCalled()
  })

  it('still calls the provider when the pause is off', async () => {
    const run = vi.fn(async () => ({
      content: [{ type: 'text', text: `{"summaries":[{"owner":"acme","repo":"skills","sentence":"Alpha changed."}]}` }],
    }))

    const summarise = resolveDigestSummariser({ paused: false, ai: { run } })
    const result = await summarise({
      subscriptions: [{
        owner: 'acme',
        repo: 'skills',
        skills: [{ name: 'alpha', description: 'Alpha', changeCount: 2 }],
      }],
      changes: [{
        owner: 'acme',
        repo: 'skills',
        totalChangeCount: 2,
        skills: [{ name: 'alpha', changeCount: 2, commitMessages: ['one'] }],
        diffExcerpt: '',
      }],
    })

    expect(result).toMatchObject({ _tag: 'summarized' })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('reports ok for a delivered digest when the summary is paused', () => {
    const run = summariseDigestRun([{
      userId: 39,
      result: {
        _tag: 'sent',
        deliveryKey: 'skilld-digest:39:7200',
        providerMessageId: 'message-39',
        aiFallbackReason: 'paused',
      },
    }], { aiSummaryPaused: true })

    expect(run.status).toBe('ok')
    expect(run.summary).toMatchObject({ sent: 1, aiFallbacks: 0, errors: [] })
  })

  it('reports partial for a genuine AI fallback when the summary is live', () => {
    const run = summariseDigestRun([{
      userId: 39,
      result: {
        _tag: 'sent',
        deliveryKey: 'skilld-digest:39:7200',
        providerMessageId: 'message-39',
        aiFallbackReason: 'provider_failure: 2021: Insufficient AI Gateway credits',
      },
    }], { aiSummaryPaused: false })

    expect(run.status).toBe('partial')
    expect(run.summary.aiFallbacks).toBe(1)
    expect(run.summary.errors).toEqual([
      'user 39 AI fallback: provider_failure: 2021: Insufficient AI Gateway credits',
    ])
  })

  it('reports error when every user failed', () => {
    const run = summariseDigestRun([{
      userId: 39,
      result: {
        _tag: 'failed',
        deliveryKey: 'skilld-digest:39:7200',
        stage: 'provider',
        error: 'provider_failure',
      },
    }], { aiSummaryPaused: true })

    expect(run.status).toBe('error')
    expect(run.summary).toMatchObject({ failed: 1, sent: 0 })
  })
})
