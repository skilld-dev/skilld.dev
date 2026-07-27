import { describe, expect, it } from 'vitest'
import { resolveClusterViewState } from '../../layers/marketing/app/utils/cluster-view-state'

const data = {
  cluster: {
    slug: 'plan',
    label: 'Plan before it codes',
    icon: 'i-lucide-list-checks',
    userVoice: 'Plan first.',
  },
  items: [],
  total: 0,
  page: 1,
  pages: 1,
}

describe('resolveClusterViewState', () => {
  it('represents pending work explicitly', () => {
    expect(resolveClusterViewState({
      data: undefined,
      error: undefined,
      status: 'pending',
    })).toEqual({ _tag: 'loading' })
  })

  it('keeps recoverable failures out of the not-found path', () => {
    const error = { statusCode: 503 }

    expect(resolveClusterViewState({
      data: undefined,
      error,
      status: 'error',
    })).toEqual({ _tag: 'error', error })
  })

  it('identifies an unknown cluster only from a 404 response', () => {
    const error = { statusCode: 404 }

    expect(resolveClusterViewState({
      data: undefined,
      error,
      status: 'error',
    })).toEqual({ _tag: 'not-found' })
  })

  it('exposes valid empty responses as ready', () => {
    expect(resolveClusterViewState({
      data,
      error: undefined,
      status: 'success',
    })).toEqual({ _tag: 'ready', data })
  })
})
