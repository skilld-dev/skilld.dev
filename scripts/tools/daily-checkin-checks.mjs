import { checkReport, defineCheck, runChecks, unavailable } from '@harlan-zw/nuxt-checkin/server'
import { defineSentryCheck } from '@harlan-zw/nuxt-sentry/checks'

export function runDailyOperatorChecks({ now, token, deployment, healthReport, environment, clock = () => new Date(), request = fetch }) {
  return runChecks([
    defineSentryCheck({ id: 'sentry.skilld', org: 'harlan-zw', project: 'skilld', environment }, request),
    defineCheck({
      id: 'skilld.health-email',
      run: () => deployment
        ? checkReport(healthReport, {
            now: clock(),
            identity: { site: 'skilld.dev', environment: 'production', deployment },
            required: ['skilld.daily-health', 'skilld.daily-health-coverage'],
            maxAgeMs: 36 * 60 * 60 * 1000,
          })
        : unavailable('Deployed Worker identity is unavailable.'),
    }),
  ], {
    now,
    identity: { site: 'skilld.dev', environment: 'production', deployment: deployment ?? 'unknown' },
    required: ['sentry.skilld', 'skilld.health-email'],
    credentials: token ? { sentry: token } : {},
    timeoutMs: 30_000,
    totalTimeoutMs: 30_000,
  })
}
