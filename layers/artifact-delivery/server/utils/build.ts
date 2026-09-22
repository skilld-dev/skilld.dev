import type {
  CheckResult,
  ProblemCode,
  ResolvedSource,
  SourceRequest,
} from '../schemas/contracts'
import type { ArtifactSigner } from './attestation'
import type { CheckedArtifactSource } from './checks'
import type { ArtifactSourceFile, PublicGithubSourceClient, SourceRejection } from './github-source'
import type { ResolutionRow } from './state'
import type { TrustedRoot } from './trusted-root'
import {
  artifactAttestationSchema,
  artifactAttestationStatementSchema,
  resolvedSourceSchema,
  sourceRequestSchema,
} from '../schemas/contracts'
import { artifactR2Key, putImmutableArtifact } from './artifact-storage'
import {
  completeAttestation,
  createAttestationStatement,
  encodeAttestationStatement,
  verifyArtifactAttestation,
} from './attestation'
import { checkArtifactSource, checksBlockArtifact } from './checks'
import { digestHex } from './encoding'
import { isRetryableProblem } from './github-source'
import {
  getResolution,
  parseCheckResults,
  publishArtifactRecord,
  transitionResolution,
} from './state'
import { createDeterministicUstar } from './ustar'

export interface ArtifactBuildDependencies {
  db: D1Database
  github: PublicGithubSourceClient
  privateGithub?: (row: ResolutionRow) => Promise<PublicGithubSourceClient | SourceRejection>
  bucket: R2Bucket
  privateArtifacts?: {
    put: (input: {
      accountId: number
      artifactId: string
      resolutionId: string
      bytes: Uint8Array
      contentSha256: string
    }) => Promise<{
      _tag: 'stored' | 'existing'
      key: string
      ciphertextSha256: string
      ciphertextBytes: number
      encryptionKeyId: string
    } | { _tag: 'mutation-rejected', key: string }>
  }
  signer: ArtifactSigner
  trustedRoot: TrustedRoot
  now: () => number
}

export type ArtifactBuildOutcome
  = { _tag: 'ready' | 'blocked' | 'failed' | 'unchanged', resolutionId: string }
    | { _tag: 'superseded', resolutionId: string }

type BuildLoad
  = { _tag: 'loaded', source: ResolvedSource, files: ArtifactSourceFile[], checked: CheckedArtifactSource }
    | { _tag: 'rejected', rejection: SourceRejection }

/**
 * The loaded source carried between the `fetching`, `packaging` and `signing`
 * states of one invocation. A large build spends its subrequest budget on the
 * blob fetches, so one invocation loads at most once; a resumed invocation
 * starts with no carried load and loads again.
 */
type CarriedBuildLoad = BuildLoad | null

export async function processArtifactBuild(
  dependencies: ArtifactBuildDependencies,
  resolutionId: string,
): Promise<ArtifactBuildOutcome> {
  let row = await getResolution(dependencies.db, resolutionId)
  if (!row)
    return { _tag: 'unchanged', resolutionId }
  if (row.state === 'ready' || row.state === 'blocked' || row.state === 'failed' || row.state === 'revoked')
    return { _tag: row.state === 'revoked' ? 'unchanged' : row.state, resolutionId }

  let carried: CarriedBuildLoad = null
  for (let step = 0; step < 10; step++) {
    const now = dependencies.now()
    if (row.state === 'requested') {
      const advanced = await transitionResolution(dependencies.db, row, 'resolving', {}, now)
      if (advanced._tag === 'superseded')
        return { _tag: 'superseded', resolutionId }
      row = advanced.row
      continue
    }

    if (row.state === 'resolving') {
      const github = await githubForResolution(dependencies, row)
      if (isSourceRejection(github))
        return await failWithRejection(dependencies, row, github)
      const result = await github.resolve(sourceRequestFromRow(row))
      if (result._tag === 'rejected')
        return await failWithRejection(dependencies, row, result)
      const source = result.source
      if (source.visibility !== row.visibility)
        return await failResolution(dependencies, row, 'SOURCE_NOT_FOUND', false)
      const advanced = await transitionResolution(dependencies.db, row, 'fetching', {
        repositoryId: source.repositoryId,
        resolvedOwner: source.owner,
        resolvedRepository: source.repository,
        commitSha: source.commitSha,
        treeSha: source.treeSha,
        skillPath: source.skillPath,
      }, now)
      if (advanced._tag === 'superseded')
        return { _tag: 'superseded', resolutionId }
      row = advanced.row
      continue
    }

    if (row.state === 'fetching') {
      const loaded = await loadAndCheck(dependencies, row, resolvedSourceFromRow(row))
      carried = loaded._tag === 'loaded' ? loaded : null
      const checkResults = loaded._tag === 'loaded'
        ? loaded.checked.checkResults
        : rejectionCheckResults(loaded.rejection)
      if (loaded._tag === 'rejected' && loaded.rejection.code !== 'INVALID_SOURCE')
        return await failWithRejection(dependencies, row, loaded.rejection)
      const advanced = await transitionResolution(dependencies.db, row, 'checking', {
        checkResultsJson: JSON.stringify(checkResults),
      }, now)
      if (advanced._tag === 'superseded')
        return { _tag: 'superseded', resolutionId }
      row = advanced.row
      continue
    }

    if (row.state === 'checking') {
      const checks = parseCheckResults(row.check_results_json)
      const next = checksBlockArtifact(checks) ? 'blocked' : 'packaging'
      const advanced = await transitionResolution(dependencies.db, row, next, {}, now)
      if (advanced._tag === 'superseded')
        return { _tag: 'superseded', resolutionId }
      row = advanced.row
      if (next === 'blocked')
        return { _tag: 'blocked', resolutionId }
      continue
    }

    if (row.state === 'packaging') {
      const loaded: BuildLoad = carried ?? await requirePassingSource(dependencies, row)
      if (loaded._tag === 'rejected')
        return await failWithRejection(dependencies, row, loaded.rejection)
      carried = loaded
      const archive = createDeterministicUstar(loaded.files)
      const contentSha256 = await digestHex('SHA-256', archive)
      const advanced = await transitionResolution(dependencies.db, row, 'signing', {
        artifactId: `sha256:${contentSha256}`,
        contentSha256,
        contentBytes: archive.byteLength,
      }, now)
      if (advanced._tag === 'superseded')
        return { _tag: 'superseded', resolutionId }
      row = advanced.row
      continue
    }

    if (row.state === 'signing') {
      if (!row.artifact_id || !row.content_sha256 || !row.content_bytes)
        throw new Error('Signing Resolution has no Artifact content identity')

      if (!row.attestation_statement_json) {
        const loaded: BuildLoad = carried ?? await requirePassingSource(dependencies, row)
        if (loaded._tag === 'rejected')
          return await failWithRejection(dependencies, row, loaded.rejection)
        carried = loaded
        const archive = createDeterministicUstar(loaded.files)
        const contentSha256 = await digestHex('SHA-256', archive)
        if (contentSha256 !== row.content_sha256 || archive.byteLength !== row.content_bytes)
          return await failResolution(dependencies, row, 'INVALID_SOURCE', false)
        const write = row.visibility === 'private'
          ? await putEncryptedPrivateArtifact(dependencies, row, archive, contentSha256)
          : await putImmutableArtifact(dependencies.bucket, {
              key: artifactR2Key(contentSha256),
              bytes: archive,
              contentSha256,
            })
        if (write._tag === 'mutation-rejected')
          throw new Error('Immutable Artifact storage rejected changed bytes')
        const statement = createAttestationStatement({
          artifactId: row.artifact_id,
          createdAt: new Date(row.created_at * 1000).toISOString(),
          source: loaded.source,
          contentSha256,
          contentBytes: archive.byteLength,
          files: loaded.checked.files,
          checkResults: loaded.checked.checkResults,
        })
        const privateStoragePatch = row.visibility === 'private'
          ? privateArtifactStoragePatch(write)
          : {}
        const staged = await transitionResolution(dependencies.db, row, 'signing', {
          r2Key: write.key,
          ...privateStoragePatch,
          attestationStatementJson: encodeAttestationStatement(statement),
        }, now)
        if (staged._tag === 'superseded')
          return { _tag: 'superseded', resolutionId }
        row = staged.row
        continue
      }

      artifactAttestationStatementSchema.parse(JSON.parse(row.attestation_statement_json))
      const signature = await dependencies.signer.sign({
        resolutionId: row.id,
        artifactId: row.artifact_id,
      })
      const attestation = artifactAttestationSchema.parse(completeAttestation(row.attestation_statement_json, signature))
      if (!await verifyArtifactAttestation(attestation, dependencies.trustedRoot, now))
        throw new Error('Artifact signer returned an invalid signature')
      const advanced = await transitionResolution(dependencies.db, row, 'publishing', {
        attestationJson: JSON.stringify(attestation),
      }, now)
      if (advanced._tag === 'superseded')
        return { _tag: 'superseded', resolutionId }
      row = advanced.row
      continue
    }

    if (row.state === 'publishing') {
      const attestation = artifactAttestationSchema.parse(JSON.parse(row.attestation_json ?? 'null'))
      const published = await publishArtifactRecord(dependencies.db, {
        row,
        checks: parseCheckResults(row.check_results_json),
        attestation,
        now,
      })
      return published._tag === 'superseded'
        ? { _tag: 'superseded', resolutionId }
        : { _tag: 'ready', resolutionId }
    }
  }
  throw new Error('Artifact build exceeded its state transition limit')
}

async function loadAndCheck(
  dependencies: ArtifactBuildDependencies,
  row: ResolutionRow,
  source: ResolvedSource,
): Promise<BuildLoad> {
  const github = await githubForResolution(dependencies, row)
  if (isSourceRejection(github))
    return { _tag: 'rejected', rejection: github }
  const loaded = await github.load(source)
  if (loaded._tag === 'rejected')
    return { _tag: 'rejected', rejection: loaded }
  const checked = await checkArtifactSource(source, loaded.value.files)
  return { _tag: 'loaded', source, files: loaded.value.files, checked }
}

async function requirePassingSource(
  dependencies: ArtifactBuildDependencies,
  row: ResolutionRow,
): Promise<BuildLoad> {
  const loaded = await loadAndCheck(dependencies, row, resolvedSourceFromRow(row))
  if (loaded._tag === 'loaded' && checksBlockArtifact(loaded.checked.checkResults)) {
    return {
      _tag: 'rejected',
      rejection: {
        _tag: 'rejected',
        code: 'INVALID_SOURCE',
        summary: 'Artifact checks changed before signing.',
        findings: loaded.checked.checkResults.flatMap(check => check.findings ?? []),
      },
    }
  }
  return loaded
}

function sourceRequestFromRow(row: { requested_owner: string, requested_repository: string, selector_type: string, selector_value: string, ref_type: string | null, ref_value: string | null }): SourceRequest {
  return sourceRequestSchema.parse({
    provider: 'github',
    owner: row.requested_owner,
    repository: row.requested_repository,
    selector: row.selector_type === 'path'
      ? { type: 'path', path: row.selector_value }
      : { type: 'named-skill', name: row.selector_value },
    ref: row.ref_type && row.ref_value ? { type: row.ref_type, value: row.ref_value } : undefined,
  })
}

function resolvedSourceFromRow(row: {
  repository_id: number | null
  resolved_owner: string | null
  resolved_repository: string | null
  commit_sha: string | null
  tree_sha: string | null
  skill_path: string | null
  visibility: 'public' | 'private'
}): ResolvedSource {
  return resolvedSourceSchema.parse({
    provider: 'github',
    repositoryId: row.repository_id,
    owner: row.resolved_owner,
    repository: row.resolved_repository,
    visibility: row.visibility,
    commitSha: row.commit_sha,
    treeSha: row.tree_sha,
    skillPath: row.skill_path,
  })
}

/**
 * The check name a source rejection reports under.
 *
 * It is deliberately not one of `CURRENT_ARTIFACT_CHECKS`. These results are
 * synthesised for a Resolution that never reaches signing, so this name never
 * enters an attestation and the signed check set is unchanged. It used to be
 * `path-policy`, which named a check that had not run: a file-count rejection,
 * a symbolic link and a genuine USTAR path problem all arrived identically,
 * and the skilld CLI prints this name straight to the user.
 */
export const SOURCE_REJECTION_CHECK_NAME = 'source-policy'

function rejectionCheckResults(rejection: SourceRejection): CheckResult[] {
  return [{
    name: SOURCE_REJECTION_CHECK_NAME,
    version: '1',
    outcome: 'fail',
    required: true,
    summary: rejection.summary,
    findings: rejection.findings,
  }]
}

async function failWithRejection(
  dependencies: ArtifactBuildDependencies,
  row: NonNullable<Awaited<ReturnType<typeof getResolution>>>,
  rejection: SourceRejection,
): Promise<ArtifactBuildOutcome> {
  return await failResolution(
    dependencies,
    row,
    rejection.code,
    isRetryableProblem(rejection.code),
    rejection.retryAfterSeconds,
  )
}

export async function failResolution(
  dependencies: Pick<ArtifactBuildDependencies, 'db' | 'now'>,
  row: NonNullable<Awaited<ReturnType<typeof getResolution>>>,
  code: ProblemCode,
  retryable: boolean,
  retryAtEpochSeconds?: number,
): Promise<ArtifactBuildOutcome> {
  if (row.state === 'ready' || row.state === 'blocked' || row.state === 'failed' || row.state === 'revoked')
    return { _tag: row.state === 'revoked' ? 'unchanged' : row.state, resolutionId: row.id }
  const now = dependencies.now()
  // The upstream reset header is an absolute epoch; error_retry_after means a
  // relative delay in seconds, like HTTP Retry-After. Store the delay a reader
  // can add to now, and never let a clock skew store zero or a negative one.
  const errorRetryAfter = retryAtEpochSeconds === undefined
    ? undefined
    : Math.max(1, retryAtEpochSeconds - now)
  const advanced = await transitionResolution(dependencies.db, row, 'failed', {
    errorCode: code,
    errorRetryable: retryable,
    ...(errorRetryAfter === undefined ? {} : { errorRetryAfter }),
  }, now)
  return advanced._tag === 'superseded'
    ? { _tag: 'superseded', resolutionId: row.id }
    : { _tag: 'failed', resolutionId: row.id }
}

async function githubForResolution(
  dependencies: ArtifactBuildDependencies,
  row: ResolutionRow,
): Promise<PublicGithubSourceClient | SourceRejection> {
  if (row.visibility === 'public')
    return dependencies.github
  if (!dependencies.privateGithub) {
    return {
      _tag: 'rejected',
      code: 'SOURCE_NOT_FOUND',
      summary: 'The Repository was not found.',
      findings: [],
    }
  }
  return await dependencies.privateGithub(row)
}

async function putEncryptedPrivateArtifact(
  dependencies: ArtifactBuildDependencies,
  row: ResolutionRow,
  archive: Uint8Array,
  contentSha256: string,
) {
  if (!dependencies.privateArtifacts || !row.account_id || !row.artifact_id)
    throw new Error('Private Artifact storage is unavailable')
  return await dependencies.privateArtifacts.put({
    accountId: row.account_id,
    artifactId: row.artifact_id,
    resolutionId: row.id,
    bytes: archive,
    contentSha256,
  })
}

function isSourceRejection(
  value: PublicGithubSourceClient | SourceRejection,
): value is SourceRejection {
  return '_tag' in value && value._tag === 'rejected'
}

function privateArtifactStoragePatch(write: { _tag: string, key: string }): {
  ciphertextSha256: string
  ciphertextBytes: number
  encryptionKeyId: string
} {
  const value = write as Record<string, unknown>
  if (
    typeof value.ciphertextSha256 !== 'string'
    || typeof value.ciphertextBytes !== 'number'
    || typeof value.encryptionKeyId !== 'string'
  ) {
    throw new TypeError('Private Artifact storage returned incomplete metadata')
  }
  return {
    ciphertextSha256: value.ciphertextSha256,
    ciphertextBytes: value.ciphertextBytes,
    encryptionKeyId: value.encryptionKeyId,
  }
}
