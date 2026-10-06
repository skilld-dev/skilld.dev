import type {
  ArtifactAttestation,
  ArtifactFile,
  CheckResult,
  LinkedArtifactFile,
  ProblemCode,
  ResolvedSource,
  SourceRequest,
} from '../schemas/contracts'
import type { PackedFile, ReadOutcome, SkillFileReader } from './artifact-pack'
import type { ArtifactSigner } from './attestation'
import type { CheckedArtifactSource } from './checks'
import type { PublicGithubSourceClient, SourceRejection } from './github-source'
import type { ReadyBuildLookup, ReadyPublicBuild, ResolutionPatch, ResolutionRow } from './state'
import type { TrustedRoot } from './trusted-root'
import { createWideEvent } from '@harlan-zw/nuxt-wide-events/standalone'
import { emitOperationalEvent } from '#server/utils/operational-event'
import {
  artifactAttestationSchema,
  artifactAttestationStatementSchema,
  resolvedSourceSchema,
  sourceRequestSchema,
} from '../schemas/contracts'
import { ARTIFACT_SPOOL_BYTES, packArtifactFiles, scanArtifact } from './artifact-pack'
import { artifactR2Key, hasImmutableArtifact, putImmutableArtifact, putImmutableArtifactStream } from './artifact-storage'
import {
  completeAttestation,
  createAttestationStatement,
  encodeAttestationStatement,
  verifyArtifactAttestation,
} from './attestation'
import { checkArtifactSource, checksBlockArtifact, checksPermitSigning } from './checks'
import { canonicalJson, digestHex } from './encoding'
import { isRetryableProblem, storedFilesPassLoadRules } from './github-source'
import {
  ARTIFACT_POLICY_VERSION,
  BYTE_COMPATIBLE_POLICY_VERSIONS,
  findReadyPublicBuild,
  getResolution,
  hasLeadingBuild,
  LEADING_BUILD_FRESH_SECONDS,
  parseCheckResults,
  publishArtifactRecord,
  transitionResolution,
} from './state'
import { readDeterministicUstar } from './ustar'

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
  /** The stream R2 reads a streamed archive from. Workers use `FixedLengthStream`. */
  fixedLengthStream?: (length: number) => TransformStream<Uint8Array, Uint8Array>
}

/** Why a build did not reuse a ready build of the same commit. */
export type ReuseMissReason
  = 'no-ready-build'
    | 'attestation-untrusted'
    | 'policy-changed'
    | 'checks-changed'
    | 'record-mismatch'
    | 'bytes-missing'
    | 'linked-files-differ'

export type ArtifactBuildReuseReport
  = { _tag: 'hit', lookup: ReadyBuildLookup['_tag'], resolutionId: string, reusedFrom: string }
    | { _tag: 'miss', lookup: ReadyBuildLookup['_tag'], resolutionId: string, reason: ReuseMissReason }
    /** The stored bytes of a ready build were checked again, with no GitHub read. */
    | { _tag: 'recheck', lookup: ReadyBuildLookup['_tag'], resolutionId: string, reusedFrom: string }

export type ArtifactBuildOutcome
  = { _tag: 'ready' | 'blocked' | 'failed' | 'unchanged', resolutionId: string }
    | { _tag: 'superseded', resolutionId: string }
    /** An earlier build of the same Skill at the same commit is running. Process this one again later. */
    | { _tag: 'deferred', resolutionId: string, delaySeconds: number }

/** How long a build waits before it looks again at the earlier build it follows. */
export const LEADING_BUILD_WAIT_SECONDS = 2

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
  linkedFiles: LinkedArtifactFile[]
}

type ReuseDecision
  = { _tag: 'hit', build: ReusableBuild }
    | { _tag: 'miss', reason: ReuseMissReason }

interface LoadedBuild {
  _tag: 'loaded'
  source: ResolvedSource
  checked: CheckedArtifactSource
  content: { contentSha256: string, contentBytes: number }
  linkedFiles: LinkedArtifactFile[]
  bytes: ArtifactBytes
}

/**
 * Where a loaded build gets the archive it stores: kept from its scan when
 * small, written again from GitHub as it streams to R2, or already stored.
 */
type ArtifactBytes
  = { _tag: 'spooled', archive: Uint8Array }
    | { _tag: 'streamed', files: readonly PackedFile[], read: SkillFileReader, readFromGithub: ReadonlySet<string> }
    | { _tag: 'stored', key: string }

interface ReusedBuild {
  _tag: 'reused'
  build: ReusableBuild
}

type BuildLoad
  = LoadedBuild
    | ReusedBuild
    | { _tag: 'rejected', rejection: SourceRejection }

/** An earlier build of the same source is running, so this one waits for it. */
interface FollowingBuild { _tag: 'following' }

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
      const pinned = await startPinnedBuild(dependencies, row)
      if (pinned?._tag === 'following')
        return { _tag: 'deferred', resolutionId, delaySeconds: LEADING_BUILD_WAIT_SECONDS }
      if (pinned) {
        const pinnedSource = pinned._tag === 'reused' ? pinned.build.source : pinned.source
        const advanced = await transitionResolution(dependencies.db, row, 'fetching', resolvedSourcePatch(pinnedSource), now)
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
      const next: BuildLoad | FollowingBuild = carried ?? await reuseOrLoad(dependencies, row)
      if (next._tag === 'following')
        return { _tag: 'deferred', resolutionId, delaySeconds: LEADING_BUILD_WAIT_SECONDS }
      const loaded: BuildLoad = next
      carried = loaded._tag === 'rejected' ? null : loaded
      const checkResults = loaded._tag === 'loaded'
        ? loaded.checked.checkResults
        : loaded._tag === 'reused'
          ? loaded.build.checkResults
          : rejectionCheckResults(loaded.rejection)
      if (loaded._tag === 'rejected' && loaded.rejection.code !== 'INVALID_SOURCE')
        return await failWithRejection(dependencies, row, loaded.rejection)
      // A large archive streams from GitHub to R2 for a second time. That
      // happens here, before the checks are recorded: the skilld CLI gives a
      // Resolution 15 seconds at each stage after its checks pass.
      if (loaded._tag === 'loaded' && row.visibility === 'public' && !checksBlockArtifact(checkResults)) {
        const stored = await storePublicArtifact(dependencies, loaded)
        if (stored._tag === 'rejected')
          return await failWithRejection(dependencies, row, stored)
        carried = { ...loaded, bytes: { _tag: 'stored', key: stored.key } }
      }
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
        : loaded.content
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
        if (statement._tag === 'rejected')
          return await failWithRejection(dependencies, row, statement)
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

/**
 * Stores a public Artifact under its content address. A small archive is
 * already in memory from the scan. A larger one is read from GitHub again and
 * written to R2 as it streams; R2 refuses it unless every byte matches the
 * digest the scan found. Storing the same archive twice writes nothing.
 */
async function storePublicArtifact(
  dependencies: ArtifactBuildDependencies,
  loaded: LoadedBuild,
): Promise<{ _tag: 'stored', key: string } | SourceRejection> {
  const key = artifactR2Key(loaded.content.contentSha256)
  const bytes = loaded.bytes
  if (bytes._tag === 'stored')
    return { _tag: 'stored', key: bytes.key }
  const write = bytes._tag === 'spooled'
    ? await putImmutableArtifact(dependencies.bucket, { key, bytes: bytes.archive, contentSha256: loaded.content.contentSha256 })
    : await putImmutableArtifactStream<Exclude<ReadOutcome, { _tag: 'read' }>>(dependencies.bucket, {
        key,
        contentSha256: loaded.content.contentSha256,
        contentBytes: loaded.content.contentBytes,
        write: async (output) => {
          const outcome = await packArtifactFiles({ files: bytes.files, read: bytes.read, readFromGithub: bytes.readFromGithub, write: output })
          return outcome._tag === 'read' ? { _tag: 'written' as const } : { _tag: 'failed' as const, failure: outcome }
        },
      }, dependencies.fixedLengthStream)
  if (write._tag === 'mutation-rejected')
    throw new Error('Immutable Artifact storage rejected changed bytes')
  if (write._tag === 'write-failed') {
    if (write.failure._tag === 'rejected')
      return write.failure
    // The scan read the same commit a moment ago. Another answer now is a
    // fault upstream, and a new attempt reads it again.
    return {
      _tag: 'rejected',
      code: 'SOURCE_UNAVAILABLE',
      summary: 'GitHub served other bytes for a Skill file on the second read.',
      findings: [write.failure.path],
    }
  }
  return { _tag: 'stored', key: write.key }
}

/** Store the loaded bytes, then stage the statement the signer signs. */
async function stageLoadedStatement(
  dependencies: ArtifactBuildDependencies,
  row: ResolutionRow,
  content: { artifactId: string, contentSha256: string, contentBytes: number },
  loaded: LoadedBuild,
): Promise<StagedStatement | SourceRejection> {
  if (loaded.content.contentSha256 !== content.contentSha256 || loaded.content.contentBytes !== content.contentBytes)
    return { _tag: 'content-changed' }
  let storagePatch: Pick<ResolutionPatch, 'r2Key' | 'ciphertextSha256' | 'ciphertextBytes' | 'encryptionKeyId'>
  if (row.visibility === 'private') {
    if (loaded.bytes._tag !== 'spooled')
      throw new Error('A private Artifact must be packed in memory')
    const write = await putEncryptedPrivateArtifact(dependencies, row, loaded.bytes.archive, content.contentSha256)
    if (write._tag === 'mutation-rejected')
      throw new Error('Immutable Artifact storage rejected changed bytes')
    storagePatch = { r2Key: write.key, ...privateArtifactStoragePatch(write) }
  }
  else {
    const stored = await storePublicArtifact(dependencies, loaded)
    if (stored._tag === 'rejected')
      return stored
    storagePatch = { r2Key: stored.key }
  }
  const statement = createAttestationStatement({
    artifactId: content.artifactId,
    createdAt: new Date(row.created_at * 1000).toISOString(),
    source: loaded.source,
    contentSha256: content.contentSha256,
    contentBytes: content.contentBytes,
    files: loaded.checked.files,
    checkResults: loaded.checked.checkResults,
    linkedFiles: loaded.linkedFiles,
  })
  return {
    _tag: 'staged',
    patch: {
      ...storagePatch,
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
    linkedFiles: build.linkedFiles,
  })
  return {
    _tag: 'staged',
    patch: {
      r2Key: artifactR2Key(content.contentSha256),
      attestationStatementJson: encodeAttestationStatement(statement),
    },
  }
}

/**
 * A pinned public request, before any GitHub read: reuse a ready build of its
 * commit, check stored bytes again, or wait for an earlier build of it.
 * Null means the request resolves on GitHub.
 */
async function startPinnedBuild(
  dependencies: ArtifactBuildDependencies,
  row: ResolutionRow,
): Promise<ReusedBuild | LoadedBuild | FollowingBuild | null> {
  if (row.visibility !== 'public')
    return null
  const request = sourceRequestFromRow(row)
  if (request.ref?.type !== 'commit')
    return null
  const lookup: ReadyBuildLookup = {
    _tag: 'pinned',
    owner: request.owner,
    repository: request.repository,
    commitSha: request.ref.value,
    selector: request.selector,
  }
  const decision = await decideReuse(dependencies, row, lookup)
  if (decision._tag === 'hit')
    return { _tag: 'reused', build: decision.build }
  return (bytesMayBeReused(decision.reason) ? await loadStoredBuild(dependencies, row, lookup) : null)
    ?? (await followsLeadingBuild(dependencies, row, lookup) ? { _tag: 'following' } : null)
}

/**
 * After GitHub resolves a public request: reuse a ready build of that exact
 * source, check its stored bytes again, wait for an earlier build of it, or
 * load it.
 */
async function reuseOrLoad(
  dependencies: ArtifactBuildDependencies,
  row: ResolutionRow,
): Promise<BuildLoad | FollowingBuild> {
  const source = resolvedSourceFromRow(row)
  if (row.visibility === 'public') {
    const lookup: ReadyBuildLookup = { _tag: 'resolved', source }
    const decision = await decideReuse(dependencies, row, lookup)
    if (decision._tag === 'hit')
      return { _tag: 'reused', build: decision.build }
    const stored = bytesMayBeReused(decision.reason) ? await loadStoredBuild(dependencies, row, lookup) : null
    if (stored)
      return stored
    if (await followsLeadingBuild(dependencies, row, lookup))
      return { _tag: 'following' }
  }
  return await loadAndCheck(dependencies, row, source)
}

/**
 * Whether an earlier build of the same source is running, so this one should
 * wait for it rather than spend GitHub quota on the same reads. A build waits
 * at most {@link LEADING_BUILD_FRESH_SECONDS} from its creation.
 */
async function followsLeadingBuild(
  dependencies: ArtifactBuildDependencies,
  row: ResolutionRow,
  lookup: ReadyBuildLookup,
): Promise<boolean> {
  const now = dependencies.now()
  if (row.created_at < now - LEADING_BUILD_FRESH_SECONDS)
    return false
  return await hasLeadingBuild(dependencies.db, row, lookup, now)
}

/** A ready build missed only because its policy or checks changed, so its bytes may still serve. */
function bytesMayBeReused(reason: ReuseMissReason): boolean {
  return reason === 'policy-changed' || reason === 'checks-changed'
}

/**
 * The files of a ready public build, read back from R2 and checked under the
 * current checks, when its policy packed the same bytes as the current one.
 *
 * A policy bump that changes only checks then costs no GitHub read. The
 * attestation must still verify, R2 must hold the exact bytes, and the files
 * must pass every rule a GitHub load applies today. Null means load from
 * GitHub.
 */
async function loadStoredBuild(
  dependencies: ArtifactBuildDependencies,
  row: ResolutionRow,
  lookup: ReadyBuildLookup,
): Promise<LoadedBuild | null> {
  const ready = await findReadyPublicBuild(dependencies.db, lookup)
  // A check reads the stored archive whole, so only one the size a scan
  // keeps in memory is checked again. A larger one streams from GitHub.
  if (!ready || ready.contentBytes > ARTIFACT_SPOOL_BYTES)
    return null
  const attestation = parseStoredAttestation(ready.attestationJson)
  if (
    !attestation
    || (attestation.policyVersion !== ARTIFACT_POLICY_VERSION && !BYTE_COMPATIBLE_POLICY_VERSIONS.has(attestation.policyVersion))
    || !omittedNothing(attestation)
    || !attestationMatchesRecord(attestation, ready)
    || !await verifyArtifactAttestation(attestation, dependencies.trustedRoot, dependencies.now())
  ) {
    return null
  }
  const object = await dependencies.bucket.get(ready.r2Key)
  if (!object)
    return null
  const bytes = new Uint8Array(await object.arrayBuffer())
  if (bytes.byteLength !== ready.contentBytes || await digestHex('SHA-256', bytes) !== ready.contentSha256)
    return null
  const files = await readDeterministicUstar(bytes)
  if (!files || !storedFilesPassLoadRules(files, ready.source.skillPath))
    return null
  const reportReuse = dependencies.reportReuse ?? emitReuseEvent
  reportReuse({
    _tag: 'recheck',
    lookup: lookup._tag,
    resolutionId: row.id,
    reusedFrom: ready.resolutionId,
  })
  return {
    _tag: 'loaded',
    source: ready.source,
    checked: await checkArtifactSource(ready.source, files, []),
    content: { contentSha256: ready.contentSha256, contentBytes: ready.contentBytes },
    linkedFiles: [],
    bytes: { _tag: 'spooled', archive: bytes },
  }
}

/**
 * Whether a stored build left no file out. R2 holds only the files it packed,
 * so a build that left some out cannot be checked again from its bytes.
 * Policies before the `omitted-files` check never left a file out.
 */
function omittedNothing(attestation: ArtifactAttestation): boolean {
  const omitted = attestation.checkResults.find(check => check.name === 'omitted-files')
  return omitted === undefined || omitted.outcome === 'pass'
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
  const found = await findReusableBuild(dependencies, lookup, acceptsLinkedFiles(row))
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
  linkedFiles: boolean,
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
  if (!attestationMatchesRecord(attestation, ready))
    return { _tag: 'miss', reason: 'record-mismatch' }
  if (!deliversTo(attestation, linkedFiles))
    return { _tag: 'miss', reason: 'linked-files-differ' }
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
      linkedFiles: attestation.linkedFiles ?? [],
    },
  }
}

/**
 * Whether a ready build answers a skilld CLI that does, or does not, read
 * linked files. A build with linked files serves only a CLI that reads them.
 * A build that left no file out serves both, since neither would link or
 * omit anything. A build that left files out can only be rebuilt for a CLI
 * that reads linked files: it may link some of them.
 */
function deliversTo(attestation: ArtifactAttestation, linkedFiles: boolean): boolean {
  if (attestation.linkedFiles)
    return linkedFiles
  return !linkedFiles || omittedNothing(attestation)
}

/** Whether the Resolution came from a skilld CLI that reads linked files. */
function acceptsLinkedFiles(row: ResolutionRow): boolean {
  return row.linked_files === 1
}

/** Whether a stored attestation names exactly the bytes and source of its D1 record. */
function attestationMatchesRecord(attestation: ArtifactAttestation, ready: ReadyPublicBuild): boolean {
  return attestation.artifactId === ready.artifactId
    && ready.artifactId === `sha256:${ready.contentSha256}`
    && attestation.contentSha256 === ready.contentSha256
    && attestation.contentBytes === ready.contentBytes
    && ready.r2Key === artifactR2Key(ready.contentSha256)
    && canonicalJson(attestation.source) === canonicalJson(ready.source)
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
  if (report._tag === 'hit' || report._tag === 'recheck') {
    emitOperationalEvent(createWideEvent({
      'operation': 'artifact-build-reuse',
      'outcome': report._tag,
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
  const loaded = await github.load(source, { linkedFiles: acceptsLinkedFiles(row) })
  if (loaded._tag === 'rejected')
    return { _tag: 'rejected', rejection: loaded }
  const plan = loaded.value
  // A private archive is encrypted whole, inside the private limits, so it is
  // always kept. A public one is kept only when small.
  const scanned = await scanArtifact({
    source,
    files: plan.files,
    read: plan.read,
    omitted: plan.omitted,
    spoolBytes: row.visibility === 'private' ? Number.POSITIVE_INFINITY : ARTIFACT_SPOOL_BYTES,
  })
  if (scanned._tag === 'rejected')
    return { _tag: 'rejected', rejection: scanned }
  return {
    _tag: 'loaded',
    source,
    checked: scanned.checked,
    content: { contentSha256: scanned.contentSha256, contentBytes: scanned.contentBytes },
    linkedFiles: plan.linked,
    bytes: scanned.spool
      ? { _tag: 'spooled', archive: scanned.spool }
      : { _tag: 'streamed', files: plan.files, read: plan.read, readFromGithub: scanned.readFromGithub },
  }
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

/**
 * The wait a retryable failure names when its cause named none. GitHub asks
 * for at least a minute after a secondary rate limit, and the build queue
 * gives up only after several minutes of failed attempts.
 */
export const DEFAULT_RETRY_AFTER_SECONDS = 60

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
  // A retryable failure whose cause named no time still names one, so the
  // CLI never prints "may be retried" without saying when.
  const errorRetryAfter = !retryable
    ? undefined
    : retryAtEpochSeconds === undefined
      ? DEFAULT_RETRY_AFTER_SECONDS
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
