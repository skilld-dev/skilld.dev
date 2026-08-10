import {
  defineNuxtQueryGroup,
  defineNuxtRpcMutation,
  defineNuxtRpcQuery,
} from '@harlan-zw/nuxt-use-query/rpc'
import {
  identityCadenceBodySchema,
  identityEmailPatchBodySchema,
  identityMeSchema,
  identityMutationResponseSchema,
  identitySubscriptionsSchema,
} from '../../shared/contracts/account'

export const identityAccountQueryOptions = {
  staleTime: 'static' as const,
}

export const identityAccountQueries = defineNuxtQueryGroup('identity:account', {
  me: () => defineNuxtRpcQuery({
    key: ['identity', 'me'],
    path: '/api/me',
    response: identityMeSchema,
  }),
  subscriptions: () => defineNuxtRpcQuery({
    key: ['identity', 'subscriptions'],
    path: '/api/me/subscriptions',
    response: identitySubscriptionsSchema,
  }),
  saveCadence: () => defineNuxtRpcMutation({
    body: identityCadenceBodySchema,
    method: 'PATCH',
    path: '/api/me/cadence',
    response: identityMutationResponseSchema,
  }),
  saveEmail: () => defineNuxtRpcMutation({
    body: identityEmailPatchBodySchema,
    method: 'PATCH',
    path: '/api/me/email',
    response: identityMutationResponseSchema,
  }),
  finishOnboarding: () => defineNuxtRpcMutation({
    body: null,
    method: 'POST',
    path: '/api/me/onboarded',
    response: identityMutationResponseSchema,
  }),
  removeSubscription: (owner: string, repo: string) => defineNuxtRpcMutation({
    method: 'DELETE',
    path: `/api/me/subscriptions/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    response: identityMutationResponseSchema,
  }),
})
