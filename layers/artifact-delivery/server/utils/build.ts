import type {
  ArtifactAttestation,
  ArtifactFile,
  CheckResult,
  ProblemCode,
  ResolvedSource,
  SourceRequest,
} from '../schemas/contracts'
import type { ArtifactSigner } from './attestation'
import type { CheckedArtifactSource } from './checks'
import type { ArtifactSourceFile, PublicGithubSourceClient, SourceRejection } from './github-source'
import type { ReadyBuildLookup, ResolutionPatch, ResolutionRow } from './state'
import type { TrustedRoot } from './trusted-root'
import { createWideEvent } from '@harlan-zw/nuxt-wide-events/standalone'
import { emitOperationalEvent } from '#server/utils/operational-event'
import {
  artifactAttestationSchema,
  artifactAttestationStatementSchema,
  resolvedSourceSchema,
  sourceRequestSchema,
} from '../schemas/contracts'
import { artifactR2Key, hasImmutableArtifact, putImmutableArtifact } from './artifact-storage'
import {
  completeAttestation,
  createAttestationStatement,
  encodeAttestationStatement,
  verifyArtifactAttestation,
} from './attestation'
import { checkArtifactSource, checksBlockArtifact, checksPermitSigning } from './checks'
import { canonicalJson, digestHex } from './encoding'
import { isRetryableProblem } from './github-source'
import {
  ARTIFACT_POLICY_VERSION,
  findReadyPublicBuild,
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
  /**
   * Receives each decision to reuse a ready build or not. The default emits the
   * `artifact-build-reuse` wide event, which the daily check-in can count.
   */
  reportReuse?: (report: ArtifactBuildReuseReport) => void
}

/** Why a build did not reuse a ready build of the same commit. */
export type ReuseMissReason
  = 'no-ready-build'
    | 'attestation-untrusted'
    | 'policy-changed'
    | 'checks-changed'
    | 'record-mismatch'
    | 'bytes-missing'

export type ArtifactBuildReuseReport
  = { _tag: 'hit', lookup: ReadyBuildLookup['_tag'], resolutionId: string, reusedFrom: string }
    | { _tag: 'miss', lookup: ReadyBuildLookup['_tag'], resolutionId: string, reason: ReuseMissReason }

export type ArtifactBuildOutcome
  = { _tag: 'ready' | 'blocked' | 'failed' | 'unchanged', resolutionId: string }
    | { _tag: 'superseded', resolutionId: string }

/**
 * A ready public build of the same commit, verified against the current trusted
 * root and still stored in R2. Its files and check results come from its signed
 * attestation, never from unsigned columns.
 */
interface ReusableBuild {
  resolutionId: string
  source: ResolvedSource
  artifactId: string
  contentSha256: string
  contentBytes: number
  files: ArtifactFile[]
  checkResults: CheckResult[]
}

type ReuseDecision
  = { _tag: 'hit', build: ReusableBuild }
    | { _tag: 'miss', reason: ReuseMissReason }

interface LoadedBuild {
  _tag: 'loaded'
  source: ResolvedSource
  files: ArtifactSourceFile[]
  checked: CheckedArtifactSource
}

interface ReusedBuild {
  _tag: 'reused'
  build: ReusableBuild
}

type BuildLoad
  = LoadedBuild
    | ReusedBuild
    | { _tag: 'rejected', rejection: SourceRejection }

type StagedStatement
  = { _tag: 'staged', patch: ResolutionPatch }
    | { _tag: 'content-changed' }

/**
 * The loaded or reused source carried between the `fetching`, `packaging` and
 * `signing` states of one invocation. A large build spends its subrequest
 * budget on the blob fetches, so one invocation loads at most once. A resumed
 * invocation starts with no carried load: it reuses a ready build again when
 * one matches, and loads from GitHub otherwise.
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
      // A request pinned to a commit that was built before needs no GitHub
      // read. An unpinned request always resolves on GitHub, so it never gets
      // an older commit than the branch or tag names now.
      const pinned = await reusePinnedBuild(dependencies, row)
      if (pinned) {
        const advanced = await transitionResolution(dependencies.db, row, 'fetching', resolvedSourcePatch(pinned.build.source), now)
        if (advanced._tag === 'superseded')
          return { _tag: 'superseded', resolutionId }
        row = advanced.row
        carried = pinned
        continue
      }
      const github = await githubForResolution(dependencies, row)
      if (isSourceRejection(github))
        return await failWithRejection(dependencies, row, github)
      const result = await github.resolve(sourceRequestFromRow(row))
      if (result._tag === 'rejected')
        return await failWithRejection(dependencies, row, result)
      const source = result.source
      if (source.visibility !== row.visibility)
        return await failResolution(dependencies, row, 'SOURCE_NOT_FOUND', false)
      const advanced = await transitionResolution(dependencies.db, row, 'fetching', resolvedSourcePatch(source), now)
      if (advanced._tag === 'superseded')
        return { _tag: 'superseded', resolutionId }
      row = advanced.row
      continue
    }

    if (row.state === 'fetching') {
      const loaded: BuildLoad = carried ?? await reuseOrLoad(dependencies, row)
      carried = loaded._tag === 'rejected' ? null : loaded
      const checkResults = loaded._tag === 'loaded'
        ? loaded.checked.checkResults
        : loaded._tag === 'reused'
          ? loaded.build.checkResults
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
      const loaded: BuildLoad = carried ?? await resumeLoad(dependencies, row)
      if (loaded._tag === 'rejected')
        return await failWithRejection(dependencies, row, loaded.rejection)
      carried = loaded
      const content = loaded._tag === 'reused'
        ? { contentSha256: loaded.build.contentSha256, contentBytes: loaded.build.contentBytes }
        : await packagedContent(loaded.files)
      const advanced = await transitionResolution(dependencies.db, row, 'signing', {
        artifactId: `sha256:${content.contentSha256}`,
        contentSha256: content.contentSha256,
        contentBytes: content.contentBytes,
      }, now)
      if (advanced._tag === 'superseded')
        return { _tag: 'superseded', resolutionId }
      row = advanced.row
      continue
    }

    if (row.state === 'signing') {
      if (!row.artifact_id || !row.content_sha256 || !row.content_bytes)
        throw new Error('Signing Resolution has no Artifact content identity')
      const content = {
        artifactId: row.artifact_id,
        contentSha256: row.content_sha256,
        contentBytes: row.content_bytes,
      }

      if (!row.attestation_statement_json) {
        const loaded: BuildLoad = carried ?? await resumeLoad(dependencies, row)
        if (loaded._tag === 'rejected')
          return await failWithRejection(dependencies, row, loaded.rejection)
        carried = loaded
        const statement = loaded._tag === 'reused'
          ? stageReusedStatement(row, content, loaded.build)
          : await stageLoadedStatement(dependencies, row, content, loaded)
        if (statement._tag === 'content-changed')
          return await failResolution(dependencies, row, 'INVALID_SOURCE', false)
        const staged = await transitionResolution(dependencies.db, row, 'signing', statement.patch, now)
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

async function packagedContent(files: ArtifactSourceFile[]): Promise<{ contentSha256: string, contentBytes: number }> {
  const archive = createDeterministicUstar(files)
  return { contentSha256: await digestHex('SHA-256', archive), contentBytes: archive.byteLength }
}

/** Store the loaded bytes, then stage the statement the signer signs. */
async function stageLoadedStatement(
  dependencies: ArtifactBuildDependencies,
  row: ResolutionRow,
  content: { artifactId: string, contentSha256: string, contentBytes: number },
  loaded: LoadedBuild,
): Promise<StagedStatement> {
  const archive = createDeterministicUstar(loaded.files)
  const contentSha256 = await digestHex('SHA-256', archive)
  if (contentSha256 !== content.contentSha256 || archive.byteLength !== content.contentBytes)
    return { _tag: 'content-changed' }
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
    artifactId: content.artifactId,
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
  return {
    _tag: 'staged',
    patch: {
      r2Key: write.key,
      ...privateStoragePatch,
      attestationStatementJson: encodeAttestationStatement(statement),
    },
  }
}

/**
 * Stage a new statement over bytes that R2 already holds.
 *
 * The statement names this Resolution's source and creation time, with the
 * files and check results of the reused build. The signer then signs it
 * through the same path as a fresh build: it hashes the R2 object again, and
 * checks the policy version, the check results, and that the statement matches
 * this row. No earlier signature is copied.
 */
function stageReusedStatement(
  row: ResolutionRow,
  content: { artifactId: string, contentSha256: string, contentBytes: number },
  build: ReusableBuild,
): StagedStatement {
  if (
    build.artifactId !== content.artifactId
    || build.contentSha256 !== content.contentSha256
    || build.contentBytes !== content.contentBytes
  ) {
    return { _tag: 'content-changed' }
  }
  const statement = createAttestationStatement({
    artifactId: content.artifactId,
    createdAt: new Date(row.created_at * 1000).toISOString(),
    source: resolvedSourceFromRow(row),
    contentSha256: content.contentSha256,
    contentBytes: content.contentBytes,
    files: build.files,
    checkResults: build.checkResults,
  })
  return {
    _tag: 'staged',
    patch: {
      r2Key: artifactR2Key(content.contentSha256),
      attestationStatementJson: encodeAttestationStatement(statement),
    },
  }
}

/** A pinned public request reuses a ready build of its commit before any GitHub read. */
async function reusePinnedBuild(
  dependencies: ArtifactBuildDependencies,
  row: ResolutionRow,
): Promise<ReusedBuild | null> {
  if (row.visibility !== 'public')
    return null
  const request = sourceRequestFromRow(row)
  if (request.ref?.type !== 'commit')
    return null
  const decision = await decideReuse(dependencies, row, {
    _tag: 'pinned',
    owner: request.owner,
    repository: request.repository,
    commitSha: request.ref.value,
    selector: request.selector,
  })
  return decision._tag === 'hit' ? { _tag: 'reused', build: decision.build } : null
}

/** After GitHub resolves a public request, reuse a ready build of that exact source, or load it. */
async function reuseOrLoad(
  dependencies: ArtifactBuildDependencies,
  row: ResolutionRow,
): Promise<BuildLoad> {
  const source = resolvedSourceFromRow(row)
  if (row.visibility === 'public') {
    const decision = await decideReuse(dependencies, row, { _tag: 'resolved', source })
    if (decision._tag === 'hit')
      return { _tag: 'reused', build: decision.build }
  }
  return await loadAndCheck(dependencies, row, source)
}

/**
 * The source for a build that resumes after `fetching` in a new invocation.
 * A ready build is reused only when it matches the check results and content
 * this Resolution already recorded.
 */
async function resumeLoad(
  dependencies: ArtifactBuildDependencies,
  row: ResolutionRow,
): Promise<BuildLoad> {
  if (row.visibility === 'public') {
    const decision = await decideReuse(
      dependencies,
      row,
      { _tag: 'resolved', source: resolvedSourceFromRow(row) },
      build => canonicalJson(build.checkResults) === canonicalJson(parseCheckResults(row.check_results_json))
        && (row.content_sha256 === null || row.content_sha256 === build.contentSha256)
        && (row.content_bytes === null || row.content_bytes === build.contentBytes),
    )
    if (decision._tag === 'hit')
      return { _tag: 'reused', build: decision.build }
  }
  return await requirePassingSource(dependencies, row)
}

async function decideReuse(
  dependencies: ArtifactBuildDependencies,
  row: ResolutionRow,
  lookup: ReadyBuildLookup,
  fitsRecord: (build: ReusableBuild) => boolean = () => true,
): Promise<ReuseDecision> {
  const found = await findReusableBuild(dependencies, lookup)
  const decision: ReuseDecision = found._tag === 'hit' && !fitsRecord(found.build)
    ? { _tag: 'miss', reason: 'record-mismatch' }
    : found
  const report: ArtifactBuildReuseReport = decision._tag === 'hit'
    ? { _tag: 'hit', lookup: lookup._tag, resolutionId: row.id, reusedFrom: decision.build.resolutionId }
    : { _tag: 'miss', lookup: lookup._tag, resolutionId: row.id, reason: decision.reason }
  ;(dependencies.reportReuse ?? emitReuseEvent)(report)
  return decision
}

/**
 * The newest ready public build for the lookup, when every input that fixes
 * its bytes and its attestation still holds:
 *
 * - the current trusted root verifies its attestation, so the signing key is
 *   still trusted and the stored statement is the one that was signed;
 * - the statement names the current policy version and format;
 * - its check results pass under the current check versions;
 * - the statement matches the stored row;
 * - R2 still holds the exact bytes.
 */
async function findReusableBuild(
  dependencies: ArtifactBuildDependencies,
  lookup: ReadyBuildLookup,
): Promise<ReuseDecision> {
  const ready = await findReadyPublicBuild(dependencies.db, lookup)
  if (!ready)
    return { _tag: 'miss', reason: 'no-ready-build' }
  const attestation = parseStoredAttestation(ready.attestationJson)
  if (!attestation || !await verifyArtifactAttestation(attestation, dependencies.trustedRoot, dependencies.now()))
    return { _tag: 'miss', reason: 'attestation-untrusted' }
  if (attestation.policyVersion !== ARTIFACT_POLICY_VERSION)
    return { _tag: 'miss', reason: 'policy-changed' }
  if (!checksPermitSigning(attestation.checkResults))
    return { _tag: 'miss', reason: 'checks-changed' }
  if (
    attestation.artifactId !== ready.artifactId
    || ready.artifactId !== `sha256:${ready.contentSha256}`
    || attestation.contentSha256 !== ready.contentSha256
    || attestation.contentBytes !== ready.contentBytes
    || ready.r2Key !== artifactR2Key(ready.contentSha256)
    || canonicalJson(attestation.source) !== canonicalJson(ready.source)
  ) {
    return { _tag: 'miss', reason: 'record-mismatch' }
  }
  const stored = await hasImmutableArtifact(dependencies.bucket, {
    key: ready.r2Key,
    contentSha256: ready.contentSha256,
    contentBytes: ready.contentBytes,
  })
  if (!stored)
    return { _tag: 'miss', reason: 'bytes-missing' }
  return {
    _tag: 'hit',
    build: {
      resolutionId: ready.resolutionId,
      source: ready.source,
      artifactId: ready.artifactId,
      contentSha256: ready.contentSha256,
      contentBytes: ready.contentBytes,
      files: attestation.files,
      checkResults: attestation.checkResults,
    },
  }
}

function parseStoredAttestation(value: string): ArtifactAttestation | null {
  const parsed = artifactAttestationSchema.safeParse(parseJson(value))
  return parsed.success ? parsed.data : null
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  }
  catch {
    // Stored text that is not JSON cannot be verified. The caller reports a miss.
    return undefined
  }
}

/** One wide event per reuse decision, so the daily check-in can count hits. */
function emitReuseEvent(report: ArtifactBuildReuseReport): void {
  if (report._tag === 'hit') {
    emitOperationalEvent(createWideEvent({
      'operation': 'artifact-build-reuse',
      'outcome': 'hit',
      'artifact.resolutionId': report.resolutionId,
      'artifact.reuseLookup': report.lookup,
      'artifact.reusedFrom': report.reusedFrom,
    }), 'info')
    return
  }
  emitOperationalEvent(createWideEvent({
    'operation': 'artifact-build-reuse',
    'outcome': 'miss',
    'artifact.resolutionId': report.resolutionId,
    'artifact.reuseLookup': report.lookup,
    'reason': report.reason,
  }), 'info')
}

function resolvedSourcePatch(source: ResolvedSource): ResolutionPatch {
  return {
    repositoryId: source.repositoryId,
    resolvedOwner: source.owner,
    resolvedRepository: source.repository,
    commitSha: source.commitSha,
    treeSha: source.treeSha,
    skillPath: source.skillPath,
  }
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
  const checked = await checkArtifactSource(source, loaded.value.files, loaded.value.omitted)
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
