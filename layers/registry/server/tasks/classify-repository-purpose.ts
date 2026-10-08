import { resolveCloudflareBindings } from '@harlan-zw/nuxt-cloudflare/bindings'
import { createRegistryJobsRuntime } from '~~/server/utils/registry-jobs-runtime'
import { runObservedScheduledTask } from '~~/server/utils/scheduled-run'
import { reportJobRun } from '~~/server/utils/sync-job-reporter'
import { prepareJob } from '#cf-jobs/app'
import { observedSchedulePolicy } from '#shared/schedule-policy'
import { listRepositoryPurposeCandidates } from '../utils/repository-purpose-effect'

export default defineScheduledTask({
  name: 'classify-repository-purpose',
  cron: '0 * * * *',
  description: 'Record repository purpose. Check large repositories first.',
  async run({ context }) {
    const env = resolveCloudflareBindings<Cloudflare.Env>(context)
    if (!env?.DB)
      return { result: { error: 'no-db' } }
    return runObservedScheduledTask({ db: env.DB, env, context, policy: observedSchedulePolicy('classify-repository-purpose') }, async () => {
      const startedAt = Date.now()
      const now = Math.floor(startedAt / 1000)
      const candidates = await listRepositoryPurposeCandidates(env.DB, now)
      const jobs = await Promise.all(candidates.map(input => prepareJob({ name: 'registry/repository-purpose', payload: input })))
      const batch = jobs.length > 0
        ? await createRegistryJobsRuntime(env as Cloudflare.Env & Record<string, unknown>)
            .createBatch({ name: `repository-purpose:${now}`, jobs })
        : null
      await reportJobRun(env.DB, 'classify-repository-purpose', {
        cron: '0 * * * *',
        status: batch?.dispatched.some(item => item.status !== 'sent') ? 'partial' : 'ok',
        durationMs: Date.now() - startedAt,
      })
      return { result: { queued: jobs.length, batchId: batch?.batchId ?? null } }
    })
  },
})
