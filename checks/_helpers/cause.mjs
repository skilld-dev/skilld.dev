import { unavailable } from '@harlan-zw/nuxt-checkin/external'

/**
 * The published runOne archives every thrown error as the generic
 * 'Check threw an exception.' and the CLI passes no onError callback, so a
 * collector failure reached the daily archive without its cause (2026-09-29:
 * five Cloudflare failures, no reason). The collector-driven checks wrap
 * their run body with this guard and archive the error message instead.
 * @param {(context: import('@harlan-zw/nuxt-checkin/external').ExternalCheckContext) => Promise<import('@harlan-zw/nuxt-checkin/external').CheckResult>} run
 * @returns {(context: import('@harlan-zw/nuxt-checkin/external').ExternalCheckContext) => Promise<import('@harlan-zw/nuxt-checkin/external').CheckResult>} a run that archives a thrown cause as Unavailable
 */
export function withCause(run) {
  return async context => run(context).catch((error) => {
    return unavailable(error instanceof Error && error.message.trim() ? error.message : 'Check evidence collection failed.')
  })
}
