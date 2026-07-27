import { describe, expect, it } from 'vitest'
import { isInputFocused, resolveRegistryViewState } from '../../layers/marketing/app/utils/registry-view-state'

describe('resolveRegistryViewState', () => {
  it('keeps an idle conditional fetch in the loading state', () => {
    expect(resolveRegistryViewState({
      data: undefined,
      error: undefined,
      status: 'idle',
    })).toEqual({ _tag: 'loading' })
  })

  it('exposes fetched items only when data exists', () => {
    const data = {
      items: [{ slug: 'one' }],
      total: 1,
      pages: 1,
    }

    expect(resolveRegistryViewState({
      data,
      error: undefined,
      status: 'success',
    })).toEqual({ _tag: 'ready', data })
  })

  it('surfaces a fetch error when no prior data exists', () => {
    const error = new Error('fetch failed')

    expect(resolveRegistryViewState({
      data: undefined,
      error,
      status: 'error',
    })).toEqual({ _tag: 'error', error })
  })
})

describe('isInputFocused', () => {
  it('does not treat two missing elements as focus', () => {
    expect(isInputFocused(undefined, undefined)).toBe(false)
  })
})
