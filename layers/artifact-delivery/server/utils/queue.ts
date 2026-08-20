import type { QueueBatch } from '#cf-jobs/server'
import type { ArtifactBuildDependencies } from './build'
import { z } from 'zod'
import { createArtifactSigner } from './attestation'
import { failResolution, processArtifactBuild } from './build'
import {
  createGithubAppClientFromEnv,
  githubAppUserTokenDependenciesFromEnv,
  loadAccountGithubAppUserToken,
} from './github-app'
import { createGithubSourceClient, createPublicGithubSourceClient } from './github-source'
import { createD1PrivateArtifactKeyProvider, privateArtifactWrappingKeysFromEnv } from './private-crypto'
import { privateArtifactAccessEnabled } from './private-feature'
import { putPrivateArtifact } from './private-storage'
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
  createDependencies: (env: Cloudflare.Env) => ArtifactBuildDependencies = createArtifactBuildDependencies,
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

export function createArtifactBuildDependencies(env: Cloudflare.Env): ArtifactBuildDependencies {
  const privateDependencies = privateArtifactAccessEnabled(env)
    ? createPrivateBuildDependencies(env)
    : {}
  return {
    db: env.DB,
    github: createPublicGithubSourceClient({ fetch, token: env.GITHUB_TOKEN }),
    bucket: env.PUBLIC_ARTIFACTS,
    signer: createArtifactSigner(env.ARTIFACT_SIGNER),
    trustedRoot: parseTrustedRoot(env.ARTIFACT_TRUSTED_ROOT_JSON, Math.floor(Date.now() / 1000)),
    now: () => Math.floor(Date.now() / 1000),
    ...privateDependencies,
  }
}

function createPrivateBuildDependencies(env: Cloudflare.Env): Pick<
  ArtifactBuildDependencies,
  'privateGithub' | 'privateArtifacts'
> {
  const githubApp = createGithubAppClientFromEnv(env)
  const privateKeys = createD1PrivateArtifactKeyProvider(env.DB, privateArtifactWrappingKeysFromEnv(env))
  return {
    privateGithub: async (row) => {
      if (!row.account_id || !row.github_installation_id || !row.repository_id)
        return privateSourceNotFound()
      const access = await env.DB.prepare(
        `SELECT u.id AS account_id
         FROM github_app_installations i
         JOIN github_app_repositories r ON r.installation_id = i.installation_id
         JOIN users u ON u.id = i.account_id
         WHERE i.installation_id = ?1
           AND i.account_id = ?2
           AND i.state = 'active'
           AND i.revoked_at IS NULL
           AND r.repository_id = ?3
           AND r.state = 'selected'
           AND r.revoked_at IS NULL
         LIMIT 1`,
      ).bind(row.github_installation_id, row.account_id, row.repository_id).first<{
        account_id: number
      }>()
      if (!access)
        return privateSourceNotFound()
      const userToken = await loadAccountGithubAppUserToken(
        env.DB,
        access.account_id,
        githubAppUserTokenDependenciesFromEnv(env),
      )
      if (!userToken)
        return privateSourceNotFound()
      if (!await githubApp.userCanAccessRepository(
        userToken,
        row.github_installation_id,
        row.repository_id,
      )) {
        return privateSourceNotFound()
      }
      const installationToken = await githubApp.createRepositoryToken(
        row.github_installation_id,
        row.repository_id,
      )
      return installationToken._tag === 'created'
        ? createGithubSourceClient({ fetch, token: installationToken.token, visibility: 'private' })
        : privateSourceNotFound()
    },
    privateArtifacts: {
      put: input => putPrivateArtifact(env.PRIVATE_ARTIFACTS, privateKeys, input),
    },
  }
}

function privateSourceNotFound() {
  return {
    _tag: 'rejected' as const,
    code: 'SOURCE_NOT_FOUND' as const,
    summary: 'The Repository was not found.',
    findings: [],
  }
}
