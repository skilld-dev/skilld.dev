import type { QueueBatch } from '#cf-jobs/server'
import type { ArtifactBuildDependencies } from './build'
import type { GithubObjectCache, GithubReadFailure } from './github-source'
import { createWideEvent } from '@harlan-zw/nuxt-wide-events/standalone'
import { z } from 'zod'
import { emitOperationalEvent } from '#server/utils/operational-event'
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

export async function enqueueArtifactBuild(env: Cloudflare.Env, resolutionId: string, delaySeconds?: number): Promise<void> {
  const message = { version: 1, resolutionId }
  if (delaySeconds === undefined)
    await env.ARTIFACT_BUILD_QUEUE.send(message)
  else
    await env.ARTIFACT_BUILD_QUEUE.send(message, { delaySeconds })
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
    if (outcome._tag === 'ok' && outcome.value._tag === 'deferred') {
      // A wait is no failure, so it goes back as a new message rather than a
      // retry. A retry would spend the delivery budget that real failures need.
      const requeued = await enqueueArtifactBuild(env, parsed.data.resolutionId, outcome.value.delaySeconds)
        .then(() => true, (error: unknown) => {
          console.error(JSON.stringify({
            operation: 'artifact-build',
            outcome: 'requeue-failed',
            resolutionId: parsed.data.resolutionId,
            error: error instanceof Error ? error.message : String(error),
          }))
          return false
        })
      if (requeued)
        message.ack()
      else
        message.retry({ delaySeconds: outcome.value.delaySeconds })
      continue
    }
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

/**
 * A failed GitHub read names its step and endpoint path. Without them the log
 * said only "The operation was aborted due to timeout" (2026-09-30).
 */
export function reportGithubReadFailure(failure: GithubReadFailure): void {
  emitOperationalEvent(createWideEvent({
    'operation': 'artifact-github-read',
    'outcome': 'failed',
    'github.step': failure.step,
    'github.endpoint': failure.endpoint,
    'upstream.status': failure.status ?? 0,
    'reason': failure.reason,
    'attempt': failure.attempts,
  }))
}

const GITHUB_OBJECT_CACHE_PREFIX = 'artifact-github:v1:'
/** Commits and trees never change. The TTL only bounds what idle Repositories keep. */
const GITHUB_OBJECT_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60

/**
 * Immutable GitHub answers in KV, shared by every build in every location.
 * A KV failure is reported and reads GitHub instead, so it never fails a build.
 */
export function createKvGithubObjectCache(kv: KVNamespace): GithubObjectCache {
  const report = (outcome: 'read-failed' | 'write-failed', error: unknown) => emitOperationalEvent(createWideEvent({
    operation: 'artifact-github-cache',
    outcome,
    reason: error instanceof Error ? error.message : String(error),
  }))
  return {
    get: async key => await kv.get(`${GITHUB_OBJECT_CACHE_PREFIX}${key}`, 'json').catch((error: unknown) => {
      report('read-failed', error)
      return null
    }),
    put: async (key, value) => {
      await kv.put(`${GITHUB_OBJECT_CACHE_PREFIX}${key}`, JSON.stringify(value), {
        expirationTtl: GITHUB_OBJECT_CACHE_TTL_SECONDS,
      }).catch((error: unknown) => report('write-failed', error))
    },
  }
}

export function createArtifactBuildDependencies(env: Cloudflare.Env): ArtifactBuildDependencies {
  const runtimeFetch = globalThis.fetch.bind(globalThis)
  const privateDependencies = privateArtifactAccessEnabled(env)
    ? createPrivateBuildDependencies(env, runtimeFetch)
    : {}
  return {
    db: env.DB,
    github: createPublicGithubSourceClient({
      fetch: runtimeFetch,
      token: env.GITHUB_TOKEN,
      onReadFailure: reportGithubReadFailure,
      cache: createKvGithubObjectCache(env.KV_CACHE),
    }),
    bucket: env.PUBLIC_ARTIFACTS,
    signer: createArtifactSigner(env.ARTIFACT_SIGNER),
    trustedRoot: parseTrustedRoot(env.ARTIFACT_TRUSTED_ROOT_JSON, Math.floor(Date.now() / 1000)),
    now: () => Math.floor(Date.now() / 1000),
    ...privateDependencies,
  }
}

function createPrivateBuildDependencies(
  env: Cloudflare.Env,
  runtimeFetch: typeof globalThis.fetch,
): Pick<
  ArtifactBuildDependencies,
  'privateGithub' | 'privateArtifacts'
> {
  const githubApp = createGithubAppClientFromEnv(env, runtimeFetch)
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
        githubAppUserTokenDependenciesFromEnv(env, runtimeFetch),
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
        ? createGithubSourceClient({ fetch: runtimeFetch, token: installationToken.token, visibility: 'private', onReadFailure: reportGithubReadFailure })
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
