import type { DigestDeliveryResult } from './digest-delivery'

// Pure accounting for one `send-digests` run. The task collects an outcome per
// user, this turns the set into the counters and the reported status.

export interface DigestUserOutcome {
  userId: number
  result: DigestDeliveryResult
}

export interface DigestRunOptions {
  // True when the task never called the summariser. A fallback is then the
  // chosen state, so it must not count as an error and must not raise the
  // status above `ok`.
  aiSummaryPaused: boolean
}

export interface DigestRunSummary {
  eligible: number
  fired: number
  sent: number
  skipped: number
  failed: number
  claimed: number
  uncertain: number
  alreadyProcessed: number
  aiFallbacks: number
  errors: string[]
}

export type DigestRunStatus = 'ok' | 'partial' | 'error'

export function summariseDigestRun(
  outcomes: DigestUserOutcome[],
  options: DigestRunOptions,
): { summary: DigestRunSummary, status: DigestRunStatus } {
  const summary: DigestRunSummary = {
    eligible: outcomes.length,
    fired: outcomes.length,
    sent: 0,
    skipped: 0,
    failed: 0,
    claimed: 0,
    uncertain: 0,
    alreadyProcessed: 0,
    aiFallbacks: 0,
    errors: [],
  }

  for (const { userId, result } of outcomes) {
    if (result._tag === 'sent') {
      summary.sent += 1
      if (result.aiFallbackReason && !options.aiSummaryPaused) {
        summary.aiFallbacks += 1
        summary.errors.push(`user ${userId} AI fallback: ${result.aiFallbackReason}`)
      }
    }
    else if (result._tag === 'skipped') {
      summary.skipped += 1
    }
    else if (result._tag === 'failed') {
      summary.failed += 1
      summary.errors.push(`user ${userId} ${result.stage}: ${result.error}`)
    }
    else if (result._tag === 'claimed') {
      summary.claimed += 1
    }
    else if (result._tag === 'delivery_uncertain') {
      summary.uncertain += 1
      summary.errors.push(`user ${userId} delivery uncertain: ${result.reason}: ${result.error}`)
    }
    else {
      summary.alreadyProcessed += 1
    }
  }

  const status: DigestRunStatus = summary.failed > 0 || summary.uncertain > 0
    ? (summary.sent > 0 || summary.skipped > 0 ? 'partial' : 'error')
    : summary.aiFallbacks > 0
      ? 'partial'
      : 'ok'

  return { summary, status }
}
