import { JOB_TIMEOUT_MS } from './contracts'

/**
 * A GitHub job's deadline: one full Harness run plus tag preparation, npm
 * publication waits, and the pull request. It counts from when the job reached
 * the head of the queue, because jobs run one at a time and a queued job
 * would otherwise spend its deadline waiting behind others.
 */
export const APP_JOB_DEADLINE_MS = JOB_TIMEOUT_MS + 15 * 60 * 1000

export function jobExpired(job: { receivedAt: number, startedAt?: number }, now: number): boolean {
  return now - (job.startedAt ?? job.receivedAt) > APP_JOB_DEADLINE_MS
}
