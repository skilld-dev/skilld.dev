import { describe, expect, it } from 'vitest'
import { isInputFocused, repositorySearchFallback, resolveRegistryViewState } from '../../layers/marketing/app/utils/registry-view-state'

describe('repositorySearchFallback', () => {
  it.each(['vojtaholik/good-css', 'https://github.com/vojtaholik/good-css'])('offers indexing for an empty search for %s', (query) => {
    expect(repositorySearchFallback(query, 'success', 0)).toEqual({
      _tag: 'repository',
      owner: 'vojtaholik',
      repo: 'good-css',
      url: 'https://github.com/vojtaholik/good-css',
    })
  })

  it.each(['idle', 'pending', 'error'] as const)('does not offer indexing while search is %s', (status) => {
    expect(repositorySearchFallback('vojtaholik/good-css', status, 0)).toBeNull()
  })

  it('keeps existing results', () => {
    expect(repositorySearchFallback('vojtaholik/good-css', 'success', 1)).toBeNull()
  })

  it.each(['css', 'build a page', '@vojtaholik', 'owner/repo/skill'])('keeps ordinary empty search for %s', (query) => {
    expect(repositorySearchFallback(query, 'success', 0)).toBeNull()
  })
})

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
