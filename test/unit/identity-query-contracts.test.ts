import { describe, expect, it } from 'vitest'
import { identityAccountQueries, identityAccountQueryOptions } from '../../layers/identity/app/queries/account'
import {
  identityCadenceBodySchema,
  identityEmailPatchBodySchema,
  identityMeSchema,
  identityMutationResponseSchema,
  identitySubscriptionsSchema,
} from '../../layers/identity/shared/contracts/account'

describe('identity account query contracts', () => {
  it('owns the shared read operations and cache keys', () => {
    expect(identityAccountQueryOptions).toEqual({ staleTime: 'static' })
    expect(identityAccountQueries.me()).toMatchObject({
      key: ['identity', 'me'],
      path: '/api/me',
      response: identityMeSchema,
    })
    expect(identityAccountQueries.subscriptions()).toMatchObject({
      key: ['identity', 'subscriptions'],
      path: '/api/me/subscriptions',
      response: identitySubscriptionsSchema,
    })
  })

  it('owns mutation paths and their shared schemas', () => {
    expect(identityAccountQueries.saveCadence()).toMatchObject({
      body: identityCadenceBodySchema,
      method: 'PATCH',
      path: '/api/me/cadence',
      response: identityMutationResponseSchema,
    })
    expect(identityAccountQueries.saveEmail()).toMatchObject({
      body: identityEmailPatchBodySchema,
      method: 'PATCH',
      path: '/api/me/email',
      response: identityMutationResponseSchema,
    })
    expect(identityAccountQueries.removeSubscription('harlan-zw', 'repo name')).toMatchObject({
      method: 'DELETE',
      path: '/api/me/subscriptions/harlan-zw/repo%20name',
      response: identityMutationResponseSchema,
    })
  })

  it('parses API responses at the shared boundary', () => {
    expect(identityMeSchema.parse({
      id: 1,
      login: 'harlan-zw',
      name: null,
      email: null,
      avatar: null,
      digest_email: null,
      email_opt_in: false,
      digest_frequency: 'weekly',
      digest_dow: 1,
      digest_hour: 9,
      timezone: 'Australia/Melbourne',
      stars_synced_at: null,
      onboarded_at: null,
    })).toMatchObject({ login: 'harlan-zw', email_opt_in: false })

    expect(identitySubscriptionsSchema.parse({
      items: [{
        owner: 'harlan-zw',
        repo: 'skilld',
        source: 'manual',
        muted_until: null,
        created_at: 1,
      }],
    }).items).toHaveLength(1)
  })
})
