import { describe, expect, it, vi } from 'vitest'
import { useTokenCreation } from '../../layers/identity/app/composables/useTokenCreation'

const issued = { accessToken: 'test.token.value', expiresAt: 2_000_000_000 }

describe('token creation', () => {
  it('blocks duplicate requests and exposes the issued token', async () => {
    let resolve!: (value: unknown) => void
    const request = vi.fn(() => new Promise((resolvePromise) => {
      resolve = resolvePromise
    }))
    const token = useTokenCreation(request)
    const first = token.create({ label: 'API script', ttl_days: 90 })
    await token.create({ label: 'API script', ttl_days: 90 })
    expect(token.state.value._tag).toBe('creating')
    expect(request).toHaveBeenCalledTimes(1)
    resolve(issued)
    await first
    expect(token.state.value).toEqual({ _tag: 'created', token: issued })
    await token.create({ label: 'API script', ttl_days: 90 })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('shows failure and lets the user retry', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const request = vi.fn().mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce(issued)
    const token = useTokenCreation(request)
    await token.create({ label: 'API script' })
    expect(token.state.value._tag).toBe('failed')
    await token.create({ label: 'API script' })
    expect(token.state.value).toEqual({ _tag: 'created', token: issued })
    vi.restoreAllMocks()
  })

  it('rejects malformed responses instead of showing a broken credential', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const token = useTokenCreation(async () => ({ accessToken: '', expiresAt: 'never' }))
    await token.create({ label: 'API script' })
    expect(token.state.value._tag).toBe('failed')
    vi.restoreAllMocks()
  })
})
