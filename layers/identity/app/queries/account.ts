import {
  defineNuxtQueryGroup,
  defineNuxtRpcMutation,
  defineNuxtRpcQuery,
} from '@harlan-zw/nuxt-use-query/rpc'
import {
  identityEmailPatchBodySchema,
  identityMeSchema,
  identityMutationResponseSchema,
  identityOwnedRepoScanResponseSchema,
  identityPrivacyPatchBodySchema,
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
  saveEmail: () => defineNuxtRpcMutation({
    body: identityEmailPatchBodySchema,
    method: 'PATCH',
    path: '/api/me/email',
    response: identityMutationResponseSchema,
  }),
  savePrivacy: () => defineNuxtRpcMutation({
    body: identityPrivacyPatchBodySchema,
    method: 'PATCH',
    path: '/api/me/privacy',
    response: identityMutationResponseSchema,
  }),
  scanOwnedRepos: () => defineNuxtRpcMutation({
    body: null,
    method: 'POST',
    path: '/api/me/repos/scan',
    response: identityOwnedRepoScanResponseSchema,
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
