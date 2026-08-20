import type { ArtifactAttestation, ProblemCode } from '../schemas/contracts'
import type { TrustedRoot } from './trusted-root'
import { artifactAttestationSchema } from '../schemas/contracts'

const PUBLIC_GRANT_SECONDS = 5 * 60

interface ArtifactGrantRow {
  id: string
  r2_key: string
  delivery_status: 'available' | 'blocked' | 'revoked'
  resolution_id: string
  resolution_state: string
  attestation_json: string
}

export type PublicGrantResult
  = {
    _tag: 'granted'
    grant: {
      kind: 'public'
      artifactId: string
      contentUrl: string
      expiresAt: string
      attestation: ArtifactAttestation
    }
  }
  | { _tag: 'denied', code: ProblemCode }
  | { _tag: 'not-found' }

export interface PublicGrantDependencies {
  db: D1Database
  trustedRoot: TrustedRoot
  publicBaseUrl: string
  now: number
}

/**
 * Every grant reads current D1 check results before it reveals cached bytes.
 * The public R2 URL is immutable. A cached object cannot create a fresh grant.
 */
export async function createPublicArtifactGrant(
  dependencies: PublicGrantDependencies,
  artifactId: string,
): Promise<PublicGrantResult> {
  const row = await dependencies.db.prepare(
    `SELECT
       a.id, a.r2_key, a.delivery_status,
       aa.resolution_id, aa.attestation_json,
       r.state AS resolution_state
     FROM artifacts a
     JOIN artifact_attestations aa ON aa.artifact_id = a.id
     JOIN artifact_resolutions r ON r.id = aa.resolution_id
     WHERE a.id = ?1
     ORDER BY aa.created_at DESC, aa.resolution_id DESC
     LIMIT 1`,
  ).bind(artifactId).first<ArtifactGrantRow>()
  if (!row)
    return { _tag: 'not-found' }
  if (row.delivery_status === 'revoked' || row.resolution_state === 'revoked')
    return { _tag: 'denied', code: 'ARTIFACT_REVOKED' }
  if (row.delivery_status !== 'available' || row.resolution_state !== 'ready')
    return { _tag: 'denied', code: 'CHECK_BLOCKED' }

  const blockedCheck = await dependencies.db.prepare(
    `SELECT name
     FROM artifact_check_results
     WHERE resolution_id = ?1
       AND required = 1
       AND outcome IN ('fail', 'error')
     LIMIT 1`,
  ).bind(row.resolution_id).first<{ name: string }>()
  if (blockedCheck)
    return { _tag: 'denied', code: 'CHECK_BLOCKED' }

  const attestation = artifactAttestationSchema.parse(JSON.parse(row.attestation_json))
  const signingKey = dependencies.trustedRoot.keys.find(key => key.keyId === attestation.signature.keyId)
  if (!signingKey || signingKey.status === 'retired' || signingKey.status === 'revoked')
    return { _tag: 'denied', code: 'ATTESTATION_EXPIRED' }
  const notBefore = Date.parse(signingKey.notBefore) / 1000
  const notAfter = Date.parse(signingKey.notAfter) / 1000
  if (dependencies.now < notBefore || dependencies.now >= notAfter)
    return { _tag: 'denied', code: 'ATTESTATION_EXPIRED' }

  const expiresAt = Math.min(dependencies.now + PUBLIC_GRANT_SECONDS, notAfter)
  const base = new URL(dependencies.publicBaseUrl)
  if (base.protocol !== 'https:')
    throw new Error('Artifact public base URL must use HTTPS')
  const contentUrl = new URL(row.r2_key, `${base.toString().replace(/\/$/, '')}/`).toString()
  return {
    _tag: 'granted',
    grant: {
      kind: 'public',
      artifactId,
      contentUrl,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
      attestation,
    },
  }
}
