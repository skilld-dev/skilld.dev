import type { ArtifactAttestation, ProblemCode } from '../schemas/contracts'
import type { PrivateArtifactKeyProvider } from './private-crypto'
import type { TrustedRoot } from './trusted-root'
import { artifactAttestationSchema, checkResultSchema } from '../schemas/contracts'
import { verifyArtifactAttestation } from './attestation'
import { checksBlockArtifact } from './checks'
import { bytesToBase64Url, digestHex } from './encoding'
import { decryptPrivateArtifact } from './private-crypto'

const PRIVATE_GRANT_SECONDS = 60

interface PrivateGrantRow {
  account_id: number
  artifact_id: string
  resolution_id: string
  content_sha256: string
  content_bytes: number
  delivery_status: string
  resolution_state: string
  attestation_json: string
  installation_id: number
  repository_id: number
}

export type PrivateGrantResult
  = {
    _tag: 'granted'
    grant: {
      kind: 'private'
      artifactId: string
      contentUrl: string
      downloadToken: string
      expiresAt: string
      attestation: ArtifactAttestation
    }
  }
  | { _tag: 'not-found' }
  | { _tag: 'denied', code: ProblemCode }

export interface PrivateGrantDependencies {
  db: D1Database
  now: number
  contentBaseUrl: string
  trustedRoot?: TrustedRoot
  verifyAttestation?: (attestation: ArtifactAttestation, now: number) => Promise<boolean>
  recheckAccess: (access: { installationId: number, repositoryId: number }) => Promise<boolean>
}

export async function createPrivateArtifactGrant(
  dependencies: PrivateGrantDependencies,
  accountId: number,
  artifactId: string,
): Promise<PrivateGrantResult> {
  const row = await dependencies.db.prepare(
    `SELECT
       pa.account_id, pa.artifact_id, pa.resolution_id,
       pa.content_sha256, pa.content_bytes, pa.delivery_status,
       ar.state AS resolution_state,
       aa.attestation_json,
       i.installation_id, gr.repository_id
     FROM private_artifacts pa
     JOIN artifact_resolutions ar ON ar.id = pa.resolution_id
     JOIN private_artifact_attestations aa ON aa.resolution_id = ar.id
     JOIN github_app_installations i
       ON i.installation_id = ar.github_installation_id
       AND i.account_id = ar.account_id
     JOIN github_app_repositories gr
       ON gr.installation_id = i.installation_id
       AND gr.repository_id = ar.repository_id
     WHERE pa.account_id = ?1
       AND pa.artifact_id = ?2
       AND ar.account_id = ?1
       AND ar.visibility = 'private'
       AND i.state = 'active'
       AND i.revoked_at IS NULL
       AND gr.state = 'selected'
       AND gr.revoked_at IS NULL
     LIMIT 1`,
  ).bind(accountId, artifactId).first<PrivateGrantRow>()
  if (!row)
    return { _tag: 'not-found' }
  if (row.delivery_status !== 'available' || row.resolution_state !== 'ready')
    return { _tag: 'not-found' }
  if (!await dependencies.recheckAccess({
    installationId: row.installation_id,
    repositoryId: row.repository_id,
  })) {
    return { _tag: 'not-found' }
  }

  const checks = await loadCurrentChecks(dependencies.db, row.resolution_id)
  if (checksBlockArtifact(checks))
    return { _tag: 'denied', code: 'CHECK_BLOCKED' }
  const parsedAttestation = artifactAttestationSchema.safeParse(parseJson(row.attestation_json))
  if (!parsedAttestation.success)
    return { _tag: 'denied', code: 'ARTIFACT_REVOKED' }
  const attestation = parsedAttestation.data
  if (
    attestation.artifactId !== artifactId
    || attestation.source.visibility !== 'private'
    || attestation.contentSha256 !== row.content_sha256
    || attestation.contentBytes !== row.content_bytes
    || artifactId !== `sha256:${row.content_sha256}`
  ) {
    return { _tag: 'denied', code: 'ARTIFACT_REVOKED' }
  }
  const verified = dependencies.verifyAttestation
    ? await dependencies.verifyAttestation(attestation, dependencies.now)
    : dependencies.trustedRoot
      ? await verifyArtifactAttestation(attestation, dependencies.trustedRoot, dependencies.now)
      : false
  if (!verified)
    return { _tag: 'denied', code: 'ATTESTATION_EXPIRED' }

  const token = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)))
  const tokenHash = await digestHex('SHA-256', token)
  const expiresAt = dependencies.now + PRIVATE_GRANT_SECONDS
  await dependencies.db.prepare(
    `INSERT INTO artifact_download_grants (
       token_hash, account_id, artifact_id, resolution_id,
       expires_at, created_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  ).bind(tokenHash, accountId, artifactId, row.resolution_id, expiresAt, dependencies.now).run()

  const base = new URL(dependencies.contentBaseUrl)
  if (base.protocol !== 'https:')
    throw new Error('Private Artifact content base URL must use HTTPS')
  const contentUrl = new URL(
    `/api/v1/artifacts/${encodeURIComponent(artifactId)}/content`,
    base,
  ).toString()
  return {
    _tag: 'granted',
    grant: {
      kind: 'private',
      artifactId,
      contentUrl,
      downloadToken: token,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
      attestation,
    },
  }
}

export interface PrivateContentDependencies {
  db: D1Database
  bucket: R2Bucket
  keys: PrivateArtifactKeyProvider
  now: number
}

export type PrivateContentResult
  = { _tag: 'content', bytes: Uint8Array }
    | { _tag: 'not-found' }
    | { _tag: 'rejected', code: 'ARTIFACT_REVOKED' }

export async function redeemPrivateArtifactGrant(
  dependencies: PrivateContentDependencies,
  accountId: number,
  artifactId: string,
  token: string,
): Promise<PrivateContentResult> {
  if (!/^[\w-]{32,512}$/.test(token))
    return { _tag: 'not-found' }
  const tokenHash = await digestHex('SHA-256', token)
  const consumed = await dependencies.db.prepare(
    `UPDATE artifact_download_grants
     SET consumed_at = ?1
     WHERE token_hash = ?2
       AND account_id = ?3
       AND artifact_id = ?4
       AND expires_at > ?1
       AND consumed_at IS NULL
       AND revoked_at IS NULL
       AND EXISTS (
         SELECT 1
         FROM artifact_resolutions ar
         JOIN github_app_installations i
           ON i.installation_id = ar.github_installation_id
           AND i.account_id = ar.account_id
         JOIN github_app_repositories gr
           ON gr.installation_id = i.installation_id
           AND gr.repository_id = ar.repository_id
         JOIN private_artifacts pa
           ON pa.resolution_id = ar.id
           AND pa.account_id = ar.account_id
         WHERE ar.id = artifact_download_grants.resolution_id
           AND ar.account_id = ?3
           AND ar.visibility = 'private'
           AND ar.state = 'ready'
           AND pa.delivery_status = 'available'
           AND i.state = 'active'
           AND i.revoked_at IS NULL
           AND gr.state = 'selected'
           AND gr.revoked_at IS NULL
       )`,
  ).bind(dependencies.now, tokenHash, accountId, artifactId).run()
  if (Number(consumed.meta.changes) !== 1)
    return { _tag: 'not-found' }

  const row = await dependencies.db.prepare(
    `SELECT
       pa.resolution_id, pa.content_sha256, pa.content_bytes,
       pa.ciphertext_sha256, pa.ciphertext_bytes, pa.r2_key,
       pa.encryption_key_id
     FROM private_artifacts pa
     JOIN artifact_download_grants g ON g.resolution_id = pa.resolution_id
     WHERE g.token_hash = ?1
       AND pa.account_id = ?2
       AND pa.artifact_id = ?3
       AND pa.delivery_status = 'available'
     LIMIT 1`,
  ).bind(tokenHash, accountId, artifactId).first<{
    resolution_id: string
    content_sha256: string
    content_bytes: number
    ciphertext_sha256: string
    ciphertext_bytes: number
    r2_key: string
    encryption_key_id: string
  }>()
  if (!row)
    return { _tag: 'not-found' }
  const object = await dependencies.bucket.get(row.r2_key)
  if (!object || !('arrayBuffer' in object))
    return { _tag: 'rejected', code: 'ARTIFACT_REVOKED' }
  if (object.size !== row.ciphertext_bytes)
    return { _tag: 'rejected', code: 'ARTIFACT_REVOKED' }
  const ciphertext = new Uint8Array(await object.arrayBuffer())
  const accountIdHash = await digestHex('SHA-256', String(accountId))
  if (
    ciphertext.byteLength !== row.ciphertext_bytes
    || await digestHex('SHA-256', ciphertext) !== row.ciphertext_sha256
    || object.customMetadata?.accountIdHash !== accountIdHash
    || object.customMetadata?.artifactId !== artifactId
    || object.customMetadata?.ciphertextSha256 !== row.ciphertext_sha256
    || object.customMetadata?.contentSha256 !== row.content_sha256
    || object.customMetadata?.encryptionKeyId !== row.encryption_key_id
    || object.customMetadata?.format !== 'skilld-private-artifact-v1'
    || object.customMetadata?.resolutionId !== row.resolution_id
  ) {
    return { _tag: 'rejected', code: 'ARTIFACT_REVOKED' }
  }
  const decrypted = await decryptPrivateArtifact(dependencies.keys, {
    accountId,
    artifactId,
    resolutionId: row.resolution_id,
    ciphertext,
    contentSha256: row.content_sha256,
    contentBytes: row.content_bytes,
    keyId: row.encryption_key_id,
  })
  return decrypted._tag === 'decrypted'
    ? { _tag: 'content', bytes: decrypted.bytes }
    : { _tag: 'rejected', code: 'ARTIFACT_REVOKED' }
}

async function loadCurrentChecks(db: D1Database, resolutionId: string) {
  const rows = await db.prepare(
    `SELECT name, version, outcome, required, summary, findings_json
     FROM artifact_check_results
     WHERE resolution_id = ?1
     ORDER BY name`,
  ).bind(resolutionId).all<{
    name: string
    version: string
    outcome: string
    required: number
    summary: string | null
    findings_json: string
  }>()
  return rows.results.map(row => checkResultSchema.parse({
    name: row.name,
    version: row.version,
    outcome: row.outcome,
    required: row.required === 1,
    summary: row.summary ?? undefined,
    findings: parseJson(row.findings_json),
  }))
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  }
  catch {
    return undefined
  }
}
