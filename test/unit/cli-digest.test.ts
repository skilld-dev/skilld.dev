import { describe, expect, it } from 'vitest'
import { toCliDigest } from '../../layers/identity/server/utils/cli-digest'

describe('toCliDigest', () => {
  it('flattens digest selections into the shared CLI response', () => {
    const response = toCliDigest({
      user: {
        id: 1,
        login: 'harlan',
        digest_email: null,
        email: null,
        email_opt_in: 1,
        digest_frequency: 'daily',
        digest_dow: null,
        digest_hour: 9,
        timezone: 'Australia/Melbourne',
        onboarded_at: 1,
      },
      windowStart: 10,
      windowEnd: 20,
      cursorStart: 1,
      cursorEnd: 2,
      entries: [{
        owner: 'nuxt',
        repo: 'nuxt',
        skillNames: ['seo'],
        changeCount: 1,
        skills: [{
          name: 'seo',
          description: 'Nuxt SEO guidance',
          changeCount: 1,
          commitMessages: ['Improve canonical URL guidance'],
          changedAt: 15,
        }],
      }],
    })

    expect(response).toEqual({
      user: { id: 1, login: 'harlan' },
      windowStart: 10,
      windowEnd: 20,
      entries: [{
        repo: 'nuxt/nuxt',
        skill: 'seo',
        at: '1970-01-01T00:00:15.000Z',
        summary: 'Improve canonical URL guidance',
      }],
    })
  })
})
