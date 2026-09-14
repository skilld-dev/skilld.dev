import { defineExternalCheck, pass, readBoundedResponseText, unavailable, warn } from '@harlan-zw/nuxt-checkin/external'
import { parseSentryIssuesResponse } from '../../scripts/tools/sentry-observability.mjs'
import { collectSentry } from '../_helpers/sentry'

export default defineExternalCheck({
  id: 'skilld.sentry-details',
  async run(context) {
    const backlog = await collectSentry(context)
    if (backlog._tag === 'Pass')
      return pass({ newIssues: [], recurringIssues: [], truncatedAtLimit: false })
    if (backlog._tag !== 'Warn' && backlog._tag !== 'Fail')
      return unavailable('Sentry backlog evidence is unavailable.')
    const token = context.credentials.sentry
    if (!token)
      return unavailable('Sentry credential is unavailable.')
    const sinceIso = context.since.toISOString()
    const url = new URL('https://sentry.io/api/0/organizations/harlan-zw/issues/')
    url.searchParams.set('query', `project:skilld is:unresolved lastSeen:>${sinceIso.slice(0, 19)}`)
    url.searchParams.set('sort', 'freq')
    url.searchParams.set('limit', '25')
    if (context.env.SENTRY_ENVIRONMENT)
      url.searchParams.set('environment', context.env.SENTRY_ENVIRONMENT)
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: context.signal, redirect: 'error' })
    const body: unknown = JSON.parse(await readBoundedResponseText(response, 2_097_152))
    const details = parseSentryIssuesResponse(response.status, body, 'runtime credential', sinceIso, 25)
    if (details._tag !== 'available')
      return { _tag: 'Warn', reason: details.diagnostic, evidence: details, coverage: 'incomplete' }
    if (details.truncatedAtLimit)
      return { _tag: 'Warn', reason: 'Sentry detail results reached the page limit.', evidence: details, coverage: 'incomplete' }
    return details.newIssues.length || details.recurringIssues.length
      ? warn('Sentry issues occurred during this window.', details)
      : pass(details)
  },
})
