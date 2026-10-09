import type { JobContext } from '#cf-jobs/server'
import { z } from 'zod'
import { resolveGithubBindings } from '../../../layers/registry/server/utils/github-client'
import { REPOSITORY_PURPOSE_MODEL, repositoryPurposeQuestions } from '../../../layers/registry/server/utils/repository-purpose'
import { readRepositoryPurposeEvidence, refreshRepositoryPurpose } from '../../../layers/registry/server/utils/repository-purpose-effect'

export default defineJob({
  name: 'registry/repository-purpose',
  queue: 'repo-review-sync',
  input: z.object({ owner: z.string().trim().min(1).max(100), repo: z.string().trim().min(1).max(100) }),
  unique: true,
  uniqueId: input => `${input.owner}/${input.repo}`,
  tries: 5,
  backoff: [60, 300, 900, 3600],
  async handle(input, ctx: JobContext<Cloudflare.Env, D1Database, Console>) {
    if (!ctx.env.AI)
      throw new Error('Repository purpose AI binding is missing.')
    const bindings = resolveGithubBindings(ctx.env)
    const result = await refreshRepositoryPurpose({
      db: ctx.db,
      readEvidence: (identity, repositoryId) => readRepositoryPurposeEvidence(identity, bindings, repositoryId),
      judge: state => ctx.env.AI.run(REPOSITORY_PURPOSE_MODEL, { state, questions: repositoryPurposeQuestions }),
    }, input, Math.floor(Date.now() / 1000))
    if (result._tag === 'source_missing') {
      await ctx.fail(`repo fetch ${result.status}`)
      return
    }
    emitOperationalEvent(createWideEvent({ operation: 'repository-purpose', outcome: result.purpose, repo: `${input.owner}/${input.repo}` }))
    ctx.reportStats?.({ rowsFetched: 1, rowsInserted: 1 })
  },
})
