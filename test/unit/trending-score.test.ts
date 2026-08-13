// @vitest-environment node
import type { EngagementCounts, ScoredPostInput } from '../../shared/trending-score'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TRENDING_WEIGHTS,
  rankRepoTrends,
  scorePost,
  scoreRepoTrend,
} from '../../shared/trending-score'

const NOW = 1_760_000_000
const HOUR = 3600

function counts(partial: Partial<EngagementCounts> = {}): EngagementCounts {
  return {
    favouriteCount: 0,
    repostCount: 0,
    replyCount: 0,
    quoteCount: 0,
    bookmarkCount: 0,
    ...partial,
  }
}

function post(partial: Partial<ScoredPostInput> = {}): ScoredPostInput {
  return {
    postId: 'p1',
    authorId: 'a1',
    postedAt: NOW - HOUR,
    repoCount: 1,
    current: counts({ favouriteCount: 100 }),
    previous: null,
    observedAt: NOW,
    ...partial,
  }
}

describe('scorePost', () => {
  it('scores a measured gain above an identical post that has stopped moving', () => {
    const shared = { postedAt: NOW - 2 * HOUR, current: counts({ favouriteCount: 300 }) }
    const climbing = scorePost(post({
      ...shared,
      previous: { ...counts({ favouriteCount: 100 }), observedAt: NOW - HOUR },
    }), NOW)
    const flat = scorePost(post({
      ...shared,
      previous: { ...counts({ favouriteCount: 300 }), observedAt: NOW - HOUR },
    }), NOW)

    expect(climbing).toBeGreaterThan(flat)
  })

  it('keeps scoring a post whose engagement went flat', () => {
    // Pure velocity scored a flat hour at exactly zero, which dropped a
    // 2,000-favourite repo off the page for not moving and emptied the whole
    // list on a quiet hour. A live run reproduced it. The floor prevents it.
    const flat = scorePost(post({
      current: counts({ favouriteCount: 2000 }),
      previous: { ...counts({ favouriteCount: 2000 }), observedAt: NOW - HOUR },
    }), NOW)
    expect(flat).toBeGreaterThan(0)
  })

  it('still ranks a flat popular post above a flat unpopular one', () => {
    const popular = scorePost(post({
      current: counts({ favouriteCount: 2000 }),
      previous: { ...counts({ favouriteCount: 2000 }), observedAt: NOW - HOUR },
    }), NOW)
    const obscure = scorePost(post({
      current: counts({ favouriteCount: 3 }),
      previous: { ...counts({ favouriteCount: 3 }), observedAt: NOW - HOUR },
    }), NOW)
    expect(popular).toBeGreaterThan(obscure)
  })

  it('weights a bookmark above a favourite, because installing is not applause', () => {
    const bookmarked = scorePost(post({ current: counts({ bookmarkCount: 100 }) }), NOW)
    const favourited = scorePost(post({ current: counts({ favouriteCount: 100 }) }), NOW)
    expect(bookmarked).toBeGreaterThan(favourited)
  })

  it('halves a post\'s contribution over one half-life of age', () => {
    const young = scorePost(post({ postedAt: NOW }), NOW)
    const older = scorePost(post({
      postedAt: NOW - DEFAULT_TRENDING_WEIGHTS.halfLifeHours * HOUR,
    }), NOW)
    expect(older).toBeCloseTo(young / 2, 5)
  })

  it('scores nothing once a post passes the maximum age', () => {
    const stale = post({
      postedAt: NOW - (DEFAULT_TRENDING_WEIGHTS.maxAgeHours + 1) * HOUR,
      current: counts({ favouriteCount: 100_000 }),
    })
    expect(scorePost(stale, NOW)).toBe(0)
  })

  it('discounts a first-cycle post against a measured one', () => {
    const coldStart = scorePost(post({ current: counts({ favouriteCount: 100 }) }), NOW)
    const undecayed = 100 * DEFAULT_TRENDING_WEIGHTS.favourite
    expect(coldStart).toBeLessThan(undecayed)
  })

  it('treats withdrawn engagement as no movement rather than negative', () => {
    // Falling counts earn no velocity bonus, but they must not push the post
    // below its own decayed total either: the score lands exactly on the floor.
    const current = counts({ favouriteCount: 50 })
    const shrinking = post({
      current,
      previous: { ...counts({ favouriteCount: 400 }), observedAt: NOW - HOUR },
    })
    const floor = scorePost(post({ current, previous: null }), NOW)

    expect(scorePost(shrinking, NOW)).toBeCloseTo(floor, 10)
    expect(scorePost(shrinking, NOW)).toBeGreaterThan(0)
  })

  it('does not turn a duplicate refresh into enormous velocity', () => {
    const doubleRun = post({
      current: counts({ favouriteCount: 101 }),
      previous: { ...counts({ favouriteCount: 100 }), observedAt: NOW - 1 },
      observedAt: NOW,
    })
    const coldStart = scorePost(post({ current: counts({ favouriteCount: 101 }) }), NOW)
    expect(scorePost(doubleRun, NOW)).toBeCloseTo(coldStart, 5)
  })
})

describe('scorePost repo dilution', () => {
  it('splits a post\'s weight across every repo it names', () => {
    const solo = scorePost(post({ repoCount: 1 }), NOW)
    const shared = scorePost(post({ repoCount: 4 }), NOW)
    expect(shared).toBeCloseTo(solo / 4, 10)
  })

  it('ranks a dedicated post above a mention in a long list', () => {
    // One tweet naming seven repos previously put all seven on the trending
    // page at an identical score, crowding out repos a post was written about.
    const listed = scorePost(post({
      current: counts({ favouriteCount: 700 }),
      repoCount: 7,
    }), NOW)
    const dedicated = scorePost(post({
      current: counts({ favouriteCount: 300 }),
      repoCount: 1,
    }), NOW)
    expect(dedicated).toBeGreaterThan(listed)
  })

  it('treats a missing or zero count as a single repo rather than dividing by zero', () => {
    const zero = scorePost(post({ repoCount: 0 }), NOW)
    const one = scorePost(post({ repoCount: 1 }), NOW)
    expect(zero).toBe(one)
    expect(Number.isFinite(zero)).toBe(true)
  })
})

describe('scoreRepoTrend', () => {
  it('counts an author once however many times they post the same repo', () => {
    const spam = scoreRepoTrend({
      owner: 'spammer',
      repo: 'skills',
      posts: Array.from({ length: 30 }, (_, i) => post({
        postId: `p${i}`,
        authorId: 'a1',
        current: counts({ favouriteCount: 10 }),
      })),
    }, NOW)

    const single = scoreRepoTrend({
      owner: 'spammer',
      repo: 'skills',
      posts: [post({ current: counts({ favouriteCount: 10 }) })],
    }, NOW)

    expect(spam.authorCount).toBe(1)
    expect(spam.postCount).toBe(30)
    expect(spam.score).toBeCloseTo(single.score, 5)
  })

  it('ranks a repo three people mention above one person shouting louder', () => {
    const broad = scoreRepoTrend({
      owner: 'broad',
      repo: 'skills',
      posts: [
        post({ postId: 'p1', authorId: 'a1', current: counts({ favouriteCount: 40 }) }),
        post({ postId: 'p2', authorId: 'a2', current: counts({ favouriteCount: 40 }) }),
        post({ postId: 'p3', authorId: 'a3', current: counts({ favouriteCount: 40 }) }),
      ],
    }, NOW)

    const loud = scoreRepoTrend({
      owner: 'loud',
      repo: 'skills',
      posts: [post({ authorId: 'solo', current: counts({ favouriteCount: 120 }) })],
    }, NOW)

    expect(broad.score).toBeGreaterThan(loud.score)
  })

  it('names the strongest post as the evidence to quote', () => {
    const result = scoreRepoTrend({
      owner: 'o',
      repo: 'r',
      posts: [
        post({ postId: 'quiet', authorId: 'a1', current: counts({ favouriteCount: 5 }) }),
        post({ postId: 'loud', authorId: 'a2', current: counts({ favouriteCount: 500 }) }),
      ],
    }, NOW)
    expect(result.topPostId).toBe('loud')
  })

  it('sums engagement only across the posts that contributed', () => {
    const result = scoreRepoTrend({
      owner: 'o',
      repo: 'r',
      posts: [
        post({ postId: 'best', authorId: 'a1', current: counts({ favouriteCount: 90 }) }),
        post({ postId: 'dupe', authorId: 'a1', current: counts({ favouriteCount: 1 }) }),
      ],
    }, NOW)
    expect(result.totals.favouriteCount).toBe(90)
  })
})

describe('rankRepoTrends', () => {
  it('orders by score and drops repos with no movement left', () => {
    const ranked = rankRepoTrends([
      {
        owner: 'o',
        repo: 'cold',
        posts: [post({
          postId: 'c',
          postedAt: NOW - (DEFAULT_TRENDING_WEIGHTS.maxAgeHours + 1) * HOUR,
          current: counts({ favouriteCount: 9999 }),
        })],
      },
      { owner: 'o', repo: 'mid', posts: [post({ postId: 'm', current: counts({ favouriteCount: 50 }) })] },
      { owner: 'o', repo: 'hot', posts: [post({ postId: 'h', current: counts({ favouriteCount: 500 }) })] },
    ], NOW)

    expect(ranked.map(r => r.repo)).toEqual(['hot', 'mid'])
  })
})
