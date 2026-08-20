import type { QueueBatch } from '#cf-jobs/server'
import type { ArtifactBuildDependencies } from './build'
import { z } from 'zod'
import { createArtifactSigner } from './attestation'
import { failResolution, processArtifactBuild } from './build'
import { createPublicGithubSourceClient } from './github-source'
import { getResolution } from './state'
import { parseTrustedRoot } from './trusted-root'

export const ARTIFACT_BUILD_QUEUE_NAME = 'skilld-artifact-build'

const artifactBuildMessageSchema = z.object({
  version: z.literal(1),
  resolutionId: z.string().uuid(),
}).strict()

export async function enqueueArtifactBuild(env: Cloudflare.Env, resolutionId: string): Promise<void> {
  await env.ARTIFACT_BUILD_QUEUE.send({ version: 1, resolutionId })
}

export async function consumeArtifactBuildBatch(
  env: Cloudflare.Env,
  batch: QueueBatch,
  createDependencies: (env: Cloudflare.Env) => ArtifactBuildDependencies = defaultBuildDependencies,
): Promise<void> {
  if (batch.queue !== ARTIFACT_BUILD_QUEUE_NAME)
    return
  const dependencies = createDependencies(env)
  for (const message of batch.messages) {
    const parsed = artifactBuildMessageSchema.safeParse(message.body)
    if (!parsed.success) {
      console.error(JSON.stringify({ operation: 'artifact-build', outcome: 'invalid-message' }))
      message.ack()
      continue
    }
    const outcome = await processArtifactBuild(dependencies, parsed.data.resolutionId)
      .then(value => ({ _tag: 'ok' as const, value }))
      .catch(error => ({ _tag: 'error' as const, error }))
    if (outcome._tag === 'ok') {
      message.ack()
      continue
    }

    console.error(JSON.stringify({
      operation: 'artifact-build',
      outcome: 'failed',
      resolutionId: parsed.data.resolutionId,
      attempt: message.attempts,
      error: outcome.error instanceof Error ? outcome.error.message : String(outcome.error),
    }))
    if (message.attempts < 5) {
      message.retry({ delaySeconds: Math.min(3600, 60 * 2 ** Math.max(0, message.attempts - 1)) })
      continue
    }
    const row = await getResolution(dependencies.db, parsed.data.resolutionId)
    if (row)
      await failResolution(dependencies, row, 'SERVICE_UNAVAILABLE', true)
    message.ack()
  }
}

function defaultBuildDependencies(env: Cloudflare.Env): ArtifactBuildDependencies {
  return {
    db: env.DB,
    github: createPublicGithubSourceClient({ fetch, token: env.GITHUB_TOKEN }),
    bucket: env.PUBLIC_ARTIFACTS,
    signer: createArtifactSigner(env.ARTIFACT_SIGNER),
    trustedRoot: parseTrustedRoot(env.ARTIFACT_TRUSTED_ROOT_JSON, Math.floor(Date.now() / 1000)),
    now: () => Math.floor(Date.now() / 1000),
  }
}
