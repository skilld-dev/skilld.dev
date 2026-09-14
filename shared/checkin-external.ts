import type { ExternalOptions } from '@harlan-zw/nuxt-checkin/external'

export const externalCheckin = {
  required: ['skilld.git', 'skilld.deploy', 'skilld.ci', 'skilld.home', 'skilld.skills', 'skilld.database', 'skilld.workers', 'skilld.health-email', 'sentry.skilld', 'skilld.sentry-details'],
  credentials: {
    sentry: {
      env: 'SENTRY_AUTH_TOKEN',
      files: [
        { path: '~/.sentryclirc', key: 'token' },
        { path: '.env.sentry-build-plugin', key: 'SENTRY_AUTH_TOKEN' },
      ],
    },
  },
  timeoutMs: 180_000,
  totalTimeoutMs: 240_000,
  save: {
    dir: 'docs/ops/checkins',
    stateFile: 'state.json',
    timestampKey: 'lastRunAt',
    baseline: 'daily',
    defaultWindowMs: 86_400_000,
  },
} satisfies ExternalOptions
