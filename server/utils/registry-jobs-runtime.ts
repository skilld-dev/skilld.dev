/// <reference types="@cloudflare/workers-types" />

import type { JobPayload } from '#cf-jobs/app'
import type { D1DatabaseLike, QueueBatch } from '#cf-jobs/server'
import { createDurableRuntime, prepareJob } from '#cf-jobs/app'

type RegistryJobEnv = Cloudflare.Env & Record<string, unknown>
export type RegistryRepoJobPayload = JobPayload<'registry/repo-maintenance'>

function attemptsFromStoredJob(job: unknown): number {
  if (typeof job !== 'object' || job === null || !('attempts' in job))
    return 1
  const attempts = Number(job.attempts)
  return Number.isSafeInteger(attempts) && attempts > 0 ? attempts : 1
}

export function createRegistryJobsRuntime(env: RegistryJobEnv) {
  return createDurableRuntime({
    // The package's minimal D1 facade omits newer statement methods present on
    // Cloudflare's generated binding. Runtime shape is checked inside the adapter.
    db: env.DB as unknown as D1DatabaseLike,
    env,
    reclaimAfterSeconds: 20 * 60,
    retryDelaySeconds: ({ job }) => Math.min(3600, 60 * 2 ** Math.max(0, attemptsFromStoredJob(job) - 1)),
    claimRetryDelaySeconds: 30,
    maxBatchCpuMs: 280_000,
    createJobContext({ job, control }) {
      return {
        env,
        db: env.DB,
        log: console,
        jobId: job.id,
        batchId: job.batchId,
        attempt: job.attempts,
        async release(delaySeconds: number) {
          control.handled = true
          control.action = 'released'
          control.delaySeconds = delaySeconds
        },
        async fail(error: string) {
          control.handled = true
          control.action = 'failed'
          control.error = error
        },
      }
    },
    onLog(event) {
      console.warn(JSON.stringify({ message: 'registry durable job', ...event }))
    },
  })
}

export async function createRegistryJobBatch(
  env: RegistryJobEnv,
  input: {
    name: string
    jobs: RegistryRepoJobPayload[]
  },
) {
  const records = await Promise.all(input.jobs.map(payload => prepareJob({
    name: 'registry/repo-maintenance',
    payload,
  })))
  return await createRegistryJobsRuntime(env).createBatch({
    name: input.name,
    jobs: records,
  })
}

export async function consumeRegistryJobBatch(
  env: RegistryJobEnv,
  batch: QueueBatch,
): Promise<void> {
  await createRegistryJobsRuntime(env).consumeBatch(batch)
}
