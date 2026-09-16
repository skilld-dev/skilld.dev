import type { ExternalCheckContext } from '@harlan-zw/nuxt-checkin/external'
import { defineSentryCheck } from '@harlan-zw/nuxt-sentry/checks'

export function collectSentry(context: ExternalCheckContext) {
  return context.collect(collectSentry, 'skilld.sentry-backlog', async signal => ({ value: await defineSentryCheck({
    id: 'sentry.skilld',
    org: 'harlan-zw',
    project: 'skilld',
    environment: context.env.SENTRY_ENVIRONMENT,
  }).run({ ...context, signal }) }))
}
