import { describe, expect, it } from 'vitest'
import { recentMergedPullRequests } from '../../shared/open-source-pull-requests'

function pull(overrides: Record<string, unknown>) {
  return {
    number: 1,
    title: 'feat(home): add the Why band',
    html_url: 'https://github.com/skilld-dev/skilld.dev/pull/1',
    merged_at: '2026-10-07T01:00:00Z',
    user: { login: 'harlan-zw', avatar_url: 'https://avatars.githubusercontent.com/u/5326365?v=4', type: 'User' },
    ...overrides,
  }
}

describe('recentMergedPullRequests', () => {
  it('merges both repositories newest first and strips the commit prefix', () => {
    const items = recentMergedPullRequests([
      { repository: 'skilld-dev/skilld.dev', pulls: [pull({ number: 516, merged_at: '2026-10-07T03:00:00Z' })] },
      { repository: 'skilld-dev/skilld', pulls: [pull({ number: 211, title: 'chore(release)!: prepare v3.6.3', merged_at: '2026-10-07T05:00:00Z' })] },
    ], 5)

    expect(items.map(item => [item.repository, item.number, item.title])).toEqual([
      ['skilld-dev/skilld', 211, 'prepare v3.6.3'],
      ['skilld-dev/skilld.dev', 516, 'add the Why band'],
    ])
    expect(items[0]!.mergedAt).toBe(Date.parse('2026-10-07T05:00:00Z') / 1000)
  })

  it('drops unmerged pulls and bot authors', () => {
    const items = recentMergedPullRequests([
      {
        repository: 'skilld-dev/skilld.dev',
        pulls: [
          pull({ number: 1, merged_at: null }),
          pull({ number: 2, user: { login: 'renovate[bot]', type: 'Bot' } }),
          pull({ number: 3 }),
        ],
      },
    ], 5)

    expect(items.map(item => item.number)).toEqual([3])
  })

  it('skips a repository whose answer does not parse, and keeps the other', () => {
    const items = recentMergedPullRequests([
      { repository: 'skilld-dev/skilld', pulls: { message: 'API rate limit exceeded' } },
      { repository: 'skilld-dev/skilld.dev', pulls: [pull({ number: 9 })] },
    ], 5)

    expect(items.map(item => item.number)).toEqual([9])
  })

  it('keeps a title that is only a prefix', () => {
    const [item] = recentMergedPullRequests([
      { repository: 'skilld-dev/skilld.dev', pulls: [pull({ title: 'chore: ' })] },
    ], 5)

    expect(item!.title).toBe('chore: ')
  })

  it('stops at the limit', () => {
    const pulls = [1, 2, 3, 4].map(number => pull({ number, merged_at: `2026-10-0${number}T00:00:00Z` }))
    const items = recentMergedPullRequests([{ repository: 'skilld-dev/skilld.dev', pulls }], 2)

    expect(items.map(item => item.number)).toEqual([4, 3])
  })
})
