import type {
  ArtifactAttestation,
  CheckResult,
  ProblemCode,
  ResolutionResponse,
  SourceRequest,
} from '../schemas/contracts'
import { z } from 'zod'
import {
  artifactAttestationSchema,
  checkResultSchema,
  problemCodeSchema,
} from '../schemas/contracts'
import { canonicalJson, digestHex } from './encoding'

export const ARTIFACT_POLICY_VERSION = '2026-08-20.1'

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

export async function resolutionRequestIdentity(source: SourceRequest, idempotencyKey: string, accountId?: number): Promise<{
  keyHash: string
  fingerprint: string
}> {
  return {
    keyHash: await digestHex('SHA-256', `${accountId ?? 'public'}\0${idempotencyKey}`),
    fingerprint: await digestHex('SHA-256', canonicalJson({ source, accountId: accountId ?? null })),
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
): Promise<CreateResolutionResult> {
  const existing = await findResolutionByRequestKey(db, identity.keyHash)
  if (existing) {
    return existing.request_fingerprint === identity.fingerprint
      ? { _tag: 'existing', row: existing }
      : { _tag: 'idempotency-conflict' }
  }

  const resolutionId = crypto.randomUUID()
  const selectorValue = source.selector.type === 'path' ? source.selector.path : source.selector.name
  const insert = await db.prepare(
    `INSERT OR IGNORE INTO artifact_resolutions (
       id, request_key_hash, request_fingerprint, state, state_version,
       requested_owner, requested_repository, selector_type, selector_value,
       ref_type, ref_value, repository_id, visibility, account_id, github_installation_id,
       created_at, updated_at
     ) VALUES (
       ?1, ?2, ?3, 'requested', 0, ?4, ?5, ?6, ?7, ?8, ?9,
       ?10, ?11, ?12, ?13, ?14, ?14
     )`,
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
  ).run()

  if (Number(insert.meta.changes) === 1) {
    const row = await getResolution(db, resolutionId)
    if (!row)
      throw new Error('Created Resolution could not be loaded')
    return { _tag: 'created', row }
  }

  const raced = await findResolutionByRequestKey(db, identity.keyHash)
  if (!raced)
    throw new Error('Resolution idempotency race could not be loaded')
  return raced.request_fingerprint === identity.fingerprint
    ? { _tag: 'existing', row: raced }
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
  ].join(' ')
  const result = await db.prepare(sql).bind(next, now, row.id, row.state, row.state_version, ...values).run()
  if (Number(result.meta.changes) !== 1)
    return { _tag: 'superseded' }
  const advanced = await getResolution(db, row.id)
  if (!advanced)
    throw new Error('Advanced Resolution could not be loaded')
  return { _tag: 'advanced', row: advanced }
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
       WHERE id = ?2 AND state = 'publishing' AND state_version = ?3`,
    ).bind(now, row.id, row.state_version),
  ]
  const results = await db.batch(statements)
  if (Number(results.at(-1)?.meta.changes) !== 1)
    return { _tag: 'superseded' }
  const published = await getResolution(db, row.id)
  if (!published)
    throw new Error('Published Resolution could not be loaded')
  return { _tag: 'published', row: published }
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
