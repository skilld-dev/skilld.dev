import { describe, expect, it, vi } from 'vitest'
import { loadFrontDoor } from '../../layers/identity/server/utils/daily-health-check'

async function noSleep() {}

describe('front door probe retry', () => {
  it('recovers a transient 522 flap without reporting failure', async () => {
    const responses = new Map<string, number[]>()
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      const seen = (responses.get(url) ?? []).length
      responses.set(url, [...(responses.get(url) ?? []), seen])
      // First attempt 522, second attempt 200.
      return { status: seen === 0 ? 522 : 200 } as Response
    }) as unknown as typeof fetch

    const result = await loadFrontDoor(fetcher, { sleep: noSleep })

    expect(result.checks.every(check => check.status === 200)).toBe(true)
  })

  it('reports a sustained non-200 after exhausting retries', async () => {
    const fetcher = vi.fn(async () => ({ status: 522 }) as Response) as unknown as typeof fetch

    const result = await loadFrontDoor(fetcher, { attempts: 3, sleep: noSleep })

    expect(result.checks.every(check => check.status === 522)).toBe(true)
    // 2 URLs x 3 attempts each.
    expect(fetcher).toHaveBeenCalledTimes(6)
  })

  it('reports a probe failure (null) when every attempt throws', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('connection refused')
    }) as unknown as typeof fetch

    const result = await loadFrontDoor(fetcher, { attempts: 2, sleep: noSleep })

    expect(result.checks.every(check => check.status === null)).toBe(true)
  })

  it('stops retrying as soon as a 200 is observed', async () => {
    const fetcher = vi.fn(async () => ({ status: 200 }) as Response) as unknown as typeof fetch

    await loadFrontDoor(fetcher, { attempts: 3, sleep: noSleep })

    // 2 URLs, one attempt each. Successful probes do not retry.
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
