import type {
  ArtifactAttestation,
  CheckResult,
  ProblemCode,
  ResolutionResponse,
  ResolvedSource,
  SourceRequest,
} from '../schemas/contracts'
import { z } from 'zod'
import {
  artifactAttestationSchema,
  checkResultSchema,
  problemCodeSchema,
  resolvedSourceSchema,
} from '../schemas/contracts'
import { canonicalJson, digestHex } from './encoding'

/**
 * The Artifact policy every attestation names. The artifact signer refuses a
 * statement under another version.
 *
 * Bump it when a change to loading, packaging, or checks changes what one
 * commit produces. A ready build signed under another version is never reused,
 * so the bump also makes every commit load from GitHub once more.
 *
 * The signer also signs the policy before this one, so a deploy window fails
 * no run. Update `SIGNABLE_ARTIFACT_POLICIES` in `checks.ts` with each bump.
 */
export const ARTIFACT_POLICY_VERSION = '2026-10-07.4'

/**
 * Earlier policies under which every ready build packed the bytes this policy
 * packs for the same commit and folder. A ready build under one of them is
 * checked again from its stored bytes, with no GitHub read.
 *
 * A bump that changes only checks adds the version it replaces. A bump that
 * changes the bytes of a folder an earlier policy accepted empties this set.
 *
 * - `2026-10-07.3`: ADR-0014 follows the symbolic links that policy refused.
 *   A folder it accepted held no link, so it packs the same files.
 * - `2026-10-07.2`: ADR-0013 streams the archive and raises the limits, so
 *   it packs folders that policy refused or left files out of. A folder it
 *   packed whole packs the same files. Artifact order moved from UTF-16 to
 *   UTF-8 path order, which differs only for a path outside the Basic
 *   Multilingual Plane; such a stored archive packs differently and fails
 *   the byte comparison, so it loads from GitHub.
 * - `2026-10-07.1`: #487 leaves large media out of a folder that policy
 *   refused. Every folder it accepted packs the same files.
 * - `2026-08-20.1`: #481 changed checks and Skill name resolution only.
 */
export const BYTE_COMPATIBLE_POLICY_VERSIONS: ReadonlySet<string> = new Set(['2026-10-07.3', '2026-10-07.2', '2026-10-07.1', '2026-08-20.1'])

export const ACTIVE_BUILD_STATES = [
  'requested',
  'resolving',
  'fetching',
  'checking',
  'packaging',
  'signing',
  'publishing',
] as const

export type ActiveBuildState = typeof ACTIVE_BUILD_STATES[number]
export type BuildState = ActiveBuildState | 'ready' | 'blocked' | 'failed' | 'revoked'

const buildStateSchema = z.enum([
  ...ACTIVE_BUILD_STATES,
  'ready',
  'blocked',
  'failed',
  'revoked',
])

const resolutionRowSchema = z.object({
  id: z.string().uuid(),
  request_key_hash: z.string().nullable(),
  request_fingerprint: z.string(),
  state: buildStateSchema,
  state_version: z.number().int().nonnegative(),
  requested_owner: z.string(),
  requested_repository: z.string(),
  selector_type: z.enum(['path', 'named-skill']),
  selector_value: z.string(),
  ref_type: z.enum(['branch', 'tag', 'commit']).nullable(),
  ref_value: z.string().nullable(),
  repository_id: z.number().int().positive().safe().nullable(),
  resolved_owner: z.string().nullable(),
  resolved_repository: z.string().nullable(),
  commit_sha: z.string().nullable(),
  tree_sha: z.string().nullable(),
  skill_path: z.string().nullable(),
  artifact_id: z.string().nullable(),
  content_sha256: z.string().nullable(),
  content_bytes: z.number().int().positive().nullable(),
  r2_key: z.string().nullable(),
  check_results_json: z.string().nullable(),
  attestation_statement_json: z.string().nullable(),
  attestation_json: z.string().nullable(),
  visibility: z.enum(['public', 'private']),
  account_id: z.number().int().positive().nullable(),
  github_installation_id: z.number().int().positive().safe().nullable(),
  ciphertext_sha256: z.string().nullable(),
  ciphertext_bytes: z.number().int().positive().nullable(),
  encryption_key_id: z.string().nullable(),
  error_code: z.string().nullable(),
  error_retryable: z.union([z.literal(0), z.literal(1)]).nullable(),
  error_retry_after: z.number().int().positive().nullable().optional(),
  /** 1 when the skilld CLI that asked reads linked files. */
  linked_files: z.union([z.literal(0), z.literal(1)]).optional(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
})

export type ResolutionRow = z.infer<typeof resolutionRowSchema>

export interface ResolutionPatch {
  repositoryId?: number
  resolvedOwner?: string
  resolvedRepository?: string
  commitSha?: string
  treeSha?: string
  skillPath?: string
  artifactId?: string
  contentSha256?: string
  contentBytes?: number
  r2Key?: string
  checkResultsJson?: string
  attestationStatementJson?: string
  attestationJson?: string
  ciphertextSha256?: string
  ciphertextBytes?: number
  encryptionKeyId?: string
  errorCode?: ProblemCode
  errorRetryable?: boolean
  errorRetryAfter?: number
}

const transitions: Record<BuildState, readonly BuildState[]> = {
  requested: ['resolving', 'failed'],
  resolving: ['fetching', 'failed'],
  fetching: ['checking', 'failed'],
  checking: ['packaging', 'blocked', 'failed'],
  packaging: ['signing', 'failed'],
  signing: ['signing', 'publishing', 'failed'],
  publishing: ['ready', 'failed'],
  ready: ['revoked'],
  blocked: [],
  failed: [],
  revoked: [],
}

export async function resolutionRequestIdentity(source: SourceRequest, idempotencyKey: string, accountId?: number, linkedFiles = false): Promise<{
  keyHash: string
  fingerprint: string
}> {
  return {
    keyHash: await digestHex('SHA-256', `${accountId ?? 'public'}\0${idempotencyKey}`),
    // The field is left out when false, so a fingerprint from before linked
    // files still matches the same request.
    fingerprint: await digestHex('SHA-256', canonicalJson({ source, accountId: accountId ?? null, ...(linkedFiles ? { linkedFiles } : {}) })),
  }
}

export type CreateResolutionResult
  = { _tag: 'created' | 'existing', row: ResolutionRow }
    | { _tag: 'idempotency-conflict' }

export async function createResolution(
  db: D1Database,
  source: SourceRequest,
  identity: { keyHash: string, fingerprint: string },
  now: number,
  access: {
    visibility: 'private'
    accountId: number
    installationId: number
    repositoryId: number
  } | { visibility: 'public' } = { visibility: 'public' },
  linkedFiles = false,
): Promise<CreateResolutionResult> {
  // A new request key inserts and returns its row in one round trip. A
  // replayed key inserts nothing, and the lookup below finds its row.
  const resolutionId = crypto.randomUUID()
  const selectorValue = source.selector.type === 'path' ? source.selector.path : source.selector.name
  const insert = await db.prepare(
    `INSERT OR IGNORE INTO artifact_resolutions (
       id, request_key_hash, request_fingerprint, state, state_version,
       requested_owner, requested_repository, selector_type, selector_value,
       ref_type, ref_value, repository_id, visibility, account_id, github_installation_id,
       linked_files, created_at, updated_at
     ) VALUES (
       ?1, ?2, ?3, 'requested', 0, ?4, ?5, ?6, ?7, ?8, ?9,
       ?10, ?11, ?12, ?13, ?15, ?14, ?14
     )
     RETURNING *`,
  ).bind(
    resolutionId,
    identity.keyHash,
    identity.fingerprint,
    source.owner,
    source.repository,
    source.selector.type,
    selectorValue,
    source.ref?.type ?? null,
    source.ref?.value ?? null,
    access.visibility === 'private' ? access.repositoryId : null,
    access.visibility,
    access.visibility === 'private' ? access.accountId : null,
    access.visibility === 'private' ? access.installationId : null,
    now,
    linkedFiles ? 1 : 0,
  ).first<Record<string, unknown>>()
  if (insert)
    return { _tag: 'created', row: resolutionRowSchema.parse(insert) }

  const existing = await findResolutionByRequestKey(db, identity.keyHash)
  if (!existing)
    throw new Error('Resolution idempotency race could not be loaded')
  return existing.request_fingerprint === identity.fingerprint
    ? { _tag: 'existing', row: existing }
    : { _tag: 'idempotency-conflict' }
}

async function findResolutionByRequestKey(db: D1Database, keyHash: string): Promise<ResolutionRow | null> {
  const row = await db.prepare(
    'SELECT * FROM artifact_resolutions WHERE request_key_hash = ?1 LIMIT 1',
  ).bind(keyHash).first<Record<string, unknown>>()
  return row ? resolutionRowSchema.parse(row) : null
}

export async function getResolution(db: D1Database, resolutionId: string): Promise<ResolutionRow | null> {
  const row = await db.prepare(
    'SELECT * FROM artifact_resolutions WHERE id = ?1 LIMIT 1',
  ).bind(resolutionId).first<Record<string, unknown>>()
  return row ? resolutionRowSchema.parse(row) : null
}

const patchColumns: Record<keyof ResolutionPatch, string> = {
  repositoryId: 'repository_id',
  resolvedOwner: 'resolved_owner',
  resolvedRepository: 'resolved_repository',
  commitSha: 'commit_sha',
  treeSha: 'tree_sha',
  skillPath: 'skill_path',
  artifactId: 'artifact_id',
  contentSha256: 'content_sha256',
  contentBytes: 'content_bytes',
  r2Key: 'r2_key',
  checkResultsJson: 'check_results_json',
  attestationStatementJson: 'attestation_statement_json',
  attestationJson: 'attestation_json',
  ciphertextSha256: 'ciphertext_sha256',
  ciphertextBytes: 'ciphertext_bytes',
  encryptionKeyId: 'encryption_key_id',
  errorCode: 'error_code',
  errorRetryable: 'error_retryable',
  errorRetryAfter: 'error_retry_after',
}

export async function transitionResolution(
  db: D1Database,
  row: ResolutionRow,
  next: BuildState,
  patch: ResolutionPatch,
  now: number,
): Promise<{ _tag: 'advanced', row: ResolutionRow } | { _tag: 'superseded' }> {
  if (!transitions[row.state].includes(next))
    throw new Error(`Invalid Artifact build transition: ${row.state} to ${next}`)

  const entries = Object.entries(patch) as Array<[keyof ResolutionPatch, ResolutionPatch[keyof ResolutionPatch]]>
  const assignments = entries.map(([key], index) => `${patchColumns[key]} = ?${index + 6}`)
  const values = entries.map(([, value]) => typeof value === 'boolean' ? Number(value) : value)
  const sql = [
    'UPDATE artifact_resolutions',
    `SET state = ?1, state_version = state_version + 1, updated_at = ?2${assignments.length ? `, ${assignments.join(', ')}` : ''}`,
    'WHERE id = ?3 AND state = ?4 AND state_version = ?5',
    // The advanced row comes back with the write, so a transition costs one
    // D1 round trip. The queue consumer runs far from the D1 primary.
    'RETURNING *',
  ].join(' ')
  const advanced = await db.prepare(sql)
    .bind(next, now, row.id, row.state, row.state_version, ...values)
    .first<Record<string, unknown>>()
  if (!advanced)
    return { _tag: 'superseded' }
  return { _tag: 'advanced', row: resolutionRowSchema.parse(advanced) }
}

/**
 * How a build looks for a ready public build of the same commit.
 *
 * - `resolved`: GitHub has resolved the request. The whole source must match.
 * - `pinned`: the request names a commit, and no GitHub read has happened. It
 *   matches the commit, the owner and Repository name that GitHub reported for
 *   the ready build, and the Skill path. A Skill name matches only a build
 *   requested by that same name, because a resolve by name picks one
 *   canonical folder of that name in the commit, the same one every time.
 */
export type ReadyBuildLookup
  = { _tag: 'resolved', source: ResolvedSource }
    | {
      _tag: 'pinned'
      owner: string
      repository: string
      commitSha: string
      selector: SourceRequest['selector']
    }

/** A ready public build as D1 stores it. Nothing here verifies its attestation. */
export interface ReadyPublicBuild {
  resolutionId: string
  source: ResolvedSource
  artifactId: string
  contentSha256: string
  contentBytes: number
  r2Key: string
  attestationJson: string
}

const readyPublicBuildRowSchema = z.object({
  id: z.string().uuid(),
  repository_id: z.number().int().positive().safe(),
  resolved_owner: z.string(),
  resolved_repository: z.string(),
  commit_sha: z.string(),
  tree_sha: z.string(),
  skill_path: z.string(),
  artifact_id: z.string(),
  content_sha256: z.string(),
  content_bytes: z.number().int().positive(),
  r2_key: z.string(),
  attestation_json: z.string(),
})

/**
 * The newest ready public build that a lookup matches, or null.
 *
 * Only a `ready` Resolution matches, so a revoked, failed or blocked one never
 * does. The Artifact must still have the `available` delivery status. The
 * caller verifies the attestation and the stored bytes before it reuses them.
 * Migration 0131 indexes both lookups.
 */
export async function findReadyPublicBuild(
  db: D1Database,
  lookup: ReadyBuildLookup,
): Promise<ReadyPublicBuild | null> {
  if (lookup._tag === 'resolved' && lookup.source.visibility !== 'public')
    return null
  const value = await readyPublicBuildStatement(db, lookup).first<Record<string, unknown>>()
  if (!value)
    return null
  const row = readyPublicBuildRowSchema.parse(value)
  return {
    resolutionId: row.id,
    source: resolvedSourceSchema.parse({
      provider: 'github',
      repositoryId: row.repository_id,
      owner: row.resolved_owner,
      repository: row.resolved_repository,
      visibility: 'public',
      commitSha: row.commit_sha,
      treeSha: row.tree_sha,
      skillPath: row.skill_path,
    }),
    artifactId: row.artifact_id,
    contentSha256: row.content_sha256,
    contentBytes: row.content_bytes,
    r2Key: row.r2_key,
    attestationJson: row.attestation_json,
  }
}

// The first two filters repeat the WHERE clause of the migration 0131 partial
// index word for word. SQLite uses a partial index only when they match.
// The order is by `created_at`, not `updated_at`: without planner stats, SQLite
// picks `idx_artifact_resolutions_state (state, updated_at)` for a pinned
// lookup when that index can supply the order, and reads every ready row.
const READY_PUBLIC_BUILD_SELECT = `SELECT r.id, r.repository_id, r.resolved_owner, r.resolved_repository,
       r.commit_sha, r.tree_sha, r.skill_path, r.artifact_id, r.content_sha256,
       r.content_bytes, r.r2_key, r.attestation_json
     FROM artifact_resolutions r
     JOIN artifacts a ON a.id = r.artifact_id
     WHERE r.state = 'ready' AND r.visibility = 'public'
       AND a.delivery_status = 'available'`
const NEWEST_READY_BUILD = 'ORDER BY r.created_at DESC, r.id DESC LIMIT 1'

function readyPublicBuildStatement(db: D1Database, lookup: ReadyBuildLookup): D1PreparedStatement {
  if (lookup._tag === 'resolved') {
    const { source } = lookup
    return db.prepare(
      `${READY_PUBLIC_BUILD_SELECT}
       AND r.commit_sha = ?1 AND r.repository_id = ?2 AND r.skill_path = ?3
       AND r.tree_sha = ?4 AND r.resolved_owner = ?5 AND r.resolved_repository = ?6
     ${NEWEST_READY_BUILD}`,
    ).bind(source.commitSha, source.repositoryId, source.skillPath, source.treeSha, source.owner, source.repository)
  }
  const selector = lookup.selector.type === 'path'
    ? { filter: 'r.skill_path = ?4', value: lookup.selector.path }
    : { filter: 'r.selector_type = \'named-skill\' AND r.selector_value = ?4', value: lookup.selector.name }
  return db.prepare(
    `${READY_PUBLIC_BUILD_SELECT}
       AND r.commit_sha = ?1
       AND r.resolved_owner = ?2 COLLATE NOCASE
       AND r.resolved_repository = ?3 COLLATE NOCASE
       AND ${selector.filter}
     ${NEWEST_READY_BUILD}`,
  ).bind(lookup.commitSha, lookup.owner, lookup.repository, selector.value)
}

/**
 * How long a build that is ahead may go without a state change and still
 * count as running. A queue consumer that died leaves a row behind, and its
 * followers must not wait for it.
 */
export const LEADING_BUILD_FRESH_SECONDS = 90

/**
 * Whether an earlier public build of the same Skill at the same commit is
 * running now, so this build can wait and then reuse it.
 *
 * Builds order by creation time, then ID, so two builds never wait for each
 * other. A `pinned` lookup matches the commit and Skill a request names, before
 * any GitHub read. A `resolved` lookup matches the source GitHub resolved.
 */
export async function hasLeadingBuild(
  db: D1Database,
  row: ResolutionRow,
  lookup: ReadyBuildLookup,
  now: number,
): Promise<boolean> {
  const match = lookup._tag === 'resolved'
    ? {
        filter: 'commit_sha = ?4 AND repository_id = ?5 AND skill_path = ?6',
        values: [lookup.source.commitSha, lookup.source.repositoryId, lookup.source.skillPath],
      }
    : {
        filter: `ref_type = 'commit' AND ref_value = ?4
          AND requested_owner = ?5 COLLATE NOCASE AND requested_repository = ?6 COLLATE NOCASE
          AND selector_type = ?7 AND selector_value = ?8`,
        values: [
          lookup.commitSha,
          lookup.owner,
          lookup.repository,
          lookup.selector.type,
          lookup.selector.type === 'path' ? lookup.selector.path : lookup.selector.name,
        ],
      }
  const leader = await db.prepare(
    `SELECT id FROM artifact_resolutions
     WHERE state IN (${ACTIVE_BUILD_STATES.map(state => `'${state}'`).join(', ')})
       AND visibility = 'public'
       AND (created_at < ?1 OR (created_at = ?1 AND id < ?2))
       AND updated_at >= ?3
       AND ${match.filter}
     LIMIT 1`,
  ).bind(row.created_at, row.id, now - LEADING_BUILD_FRESH_SECONDS, ...match.values).first<{ id: string }>()
  return leader !== null
}

export function parseCheckResults(value: string | null): CheckResult[] {
  if (!value)
    return []
  return z.array(checkResultSchema).parse(JSON.parse(value))
}

export function parseAttestation(value: string | null): ArtifactAttestation {
  if (!value)
    throw new Error('Ready Resolution has no Artifact attestation')
  return artifactAttestationSchema.parse(JSON.parse(value))
}

export function presentResolution(row: ResolutionRow): ResolutionResponse {
  if (ACTIVE_BUILD_STATES.includes(row.state as ActiveBuildState)) {
    return {
      state: 'pending',
      resolutionId: row.id,
      stage: row.state as ActiveBuildState,
      pollAfterMs: 1000,
    }
  }
  if (row.state === 'blocked') {
    return {
      state: 'blocked',
      resolutionId: row.id,
      checkResults: parseCheckResults(row.check_results_json),
    }
  }
  if (row.state === 'failed') {
    return {
      state: 'failed',
      resolutionId: row.id,
      code: problemCodeSchema.parse(row.error_code),
      retryable: row.error_retryable === 1,
      ...(row.error_retryable === 1 && row.error_retry_after ? { retryAfterSeconds: row.error_retry_after } : {}),
    }
  }
  if (row.state === 'revoked') {
    return {
      state: 'revoked',
      resolutionId: row.id,
      reasonCode: row.error_code ?? 'ARTIFACT_REVOKED',
    }
  }
  if (!row.artifact_id)
    throw new Error('Ready Resolution has no Artifact ID')
  return {
    state: 'ready',
    resolutionId: row.id,
    artifact: {
      artifactId: row.artifact_id,
      visibility: row.visibility,
      attestation: parseAttestation(row.attestation_json),
    },
  }
}

export interface PublishArtifactInput {
  row: ResolutionRow
  checks: CheckResult[]
  attestation: ArtifactAttestation
  now: number
}

export async function publishArtifactRecord(
  db: D1Database,
  input: PublishArtifactInput,
): Promise<{ _tag: 'published', row: ResolutionRow } | { _tag: 'superseded' }> {
  const { row, checks, attestation, now } = input
  if (row.state !== 'publishing' || !row.artifact_id || !row.content_sha256 || !row.content_bytes || !row.r2_key)
    throw new Error('Publishing Resolution is incomplete')

  if (row.visibility === 'public') {
    const existing = await db.prepare(
      'SELECT content_sha256, content_bytes, r2_key FROM artifacts WHERE id = ?1 LIMIT 1',
    ).bind(row.artifact_id).first<{ content_sha256: string, content_bytes: number, r2_key: string }>()
    if (existing && (
      existing.content_sha256 !== row.content_sha256
      || existing.content_bytes !== row.content_bytes
      || existing.r2_key !== row.r2_key
    )) {
      throw new Error('Existing Artifact metadata differs from immutable content')
    }
  }

  const artifactStatements: D1PreparedStatement[] = row.visibility === 'private'
    ? privateArtifactPublishStatements(db, row, attestation, now)
    : publicArtifactPublishStatements(db, row, attestation, now)
  const statements: D1PreparedStatement[] = [
    ...artifactStatements,
    ...checks.map(check => db.prepare(
      `INSERT OR REPLACE INTO artifact_check_results (
         resolution_id, name, version, outcome, required, summary, findings_json, checked_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    ).bind(
      row.id,
      check.name,
      check.version,
      check.outcome,
      Number(check.required),
      check.summary ?? null,
      JSON.stringify(check.findings ?? []),
      now,
    )),
    db.prepare(
      `UPDATE artifact_resolutions
       SET state = 'ready', state_version = state_version + 1, updated_at = ?1
       WHERE id = ?2 AND state = 'publishing' AND state_version = ?3
       RETURNING *`,
    ).bind(now, row.id, row.state_version),
  ]
  const results = await db.batch<Record<string, unknown>>(statements)
  const published = results.at(-1)?.results?.[0]
  if (!published)
    return { _tag: 'superseded' }
  return { _tag: 'published', row: resolutionRowSchema.parse(published) }
}

function publicArtifactPublishStatements(
  db: D1Database,
  row: ResolutionRow,
  attestation: ArtifactAttestation,
  now: number,
): D1PreparedStatement[] {
  return [
    db.prepare(
      `INSERT OR IGNORE INTO artifacts (
         id, content_sha256, content_bytes, format, r2_key, delivery_status, created_at, updated_at
       ) VALUES (?1, ?2, ?3, 'skilld-tar-v1', ?4, 'available', ?5, ?5)`,
    ).bind(row.artifact_id!, row.content_sha256!, row.content_bytes!, row.r2_key!, now),
    db.prepare(
      `INSERT OR REPLACE INTO artifact_attestations (
         resolution_id, artifact_id, attestation_json, created_at
       ) VALUES (?1, ?2, ?3, ?4)`,
    ).bind(row.id, row.artifact_id!, JSON.stringify(attestation), now),
  ]
}

function privateArtifactPublishStatements(
  db: D1Database,
  row: ResolutionRow,
  attestation: ArtifactAttestation,
  now: number,
): D1PreparedStatement[] {
  if (
    !row.account_id
    || !row.repository_id
    || !row.ciphertext_sha256
    || !row.ciphertext_bytes
    || !row.encryption_key_id
  ) {
    throw new Error('Publishing private Resolution is incomplete')
  }
  return [
    db.prepare(
      `INSERT INTO private_artifacts (
         account_id, artifact_id, resolution_id, repository_id,
         content_sha256, content_bytes, ciphertext_sha256, ciphertext_bytes,
         r2_key, encryption_key_id, delivery_status, created_at, updated_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'available', ?11, ?11)
       ON CONFLICT(account_id, artifact_id) DO UPDATE SET
         resolution_id = excluded.resolution_id,
         repository_id = excluded.repository_id,
         content_sha256 = excluded.content_sha256,
         content_bytes = excluded.content_bytes,
         ciphertext_sha256 = excluded.ciphertext_sha256,
         ciphertext_bytes = excluded.ciphertext_bytes,
         r2_key = excluded.r2_key,
         encryption_key_id = excluded.encryption_key_id,
         delivery_status = 'available',
         updated_at = excluded.updated_at`,
    ).bind(
      row.account_id,
      row.artifact_id!,
      row.id,
      row.repository_id,
      row.content_sha256!,
      row.content_bytes!,
      row.ciphertext_sha256,
      row.ciphertext_bytes,
      row.r2_key!,
      row.encryption_key_id,
      now,
    ),
    db.prepare(
      `INSERT OR REPLACE INTO private_artifact_attestations (
         resolution_id, account_id, artifact_id, attestation_json, created_at
       ) VALUES (?1, ?2, ?3, ?4, ?5)`,
    ).bind(row.id, row.account_id, row.artifact_id!, JSON.stringify(attestation), now),
  ]
}
