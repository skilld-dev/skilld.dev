import { describe, expect, it } from 'vitest'
import {
  isLocalReportingHost,
  sentryReportingEnabled,
} from '../../shared/sentry'

describe('sentry reporting environment', () => {
  it('refuses a local production Worker build', () => {
    expect(sentryReportingEnabled({ nodeEnv: 'production', ci: undefined })).toBe(false)
    expect(sentryReportingEnabled({ nodeEnv: 'production', ci: 'false' })).toBe(false)
  })

  it('reports from the CI production build only', () => {
    expect(sentryReportingEnabled({ nodeEnv: 'production', ci: 'true' })).toBe(true)
    expect(sentryReportingEnabled({ nodeEnv: 'development', ci: 'true' })).toBe(false)
  })

  it('blocks every loopback browser host', () => {
    for (const host of ['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0', 'skilld.localhost'])
      expect(isLocalReportingHost(host)).toBe(true)
    expect(isLocalReportingHost('skilld.dev')).toBe(false)
  })
})
