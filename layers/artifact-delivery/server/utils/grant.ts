import type { ArtifactAttestation, ProblemCode } from '../schemas/contracts'
import type { TrustedRoot } from './trusted-root'
import { artifactAttestationSchema, checkResultSchema } from '../schemas/contracts'
import { artifactR2Key } from './artifact-storage'
import { verifyArtifactAttestation } from './attestation'
import { checksBlockArtifact } from './checks'

const PUBLIC_GRANT_SECONDS = 5 * 60

interface ArtifactCheckRow {
  name: string
  version: string
  outcome: string
  required: number
  summary: string | null
  findings_json: string
}

interface ArtifactGrantRow {
  id: string
  content_sha256: string
  content_bytes: number
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
  resolutionId?: string,
): Promise<PublicGrantResult> {
  const rowStatement = dependencies.db.prepare(
    `SELECT
       a.id, a.content_sha256, a.content_bytes, a.r2_key, a.delivery_status,
       aa.resolution_id, aa.attestation_json,
       r.state AS resolution_state
     FROM artifacts a
     JOIN artifact_attestations aa ON aa.artifact_id = a.id
     JOIN artifact_resolutions r ON r.id = aa.resolution_id
     WHERE a.id = ?1
       AND (?2 IS NULL OR aa.resolution_id = ?2)
     ORDER BY aa.created_at DESC, aa.resolution_id DESC
     LIMIT 1`,
  ).bind(artifactId, resolutionId ?? null)
  const checksStatement = (id: string) => dependencies.db.prepare(
    `SELECT name, version, outcome, required, summary, findings_json
     FROM artifact_check_results
     WHERE resolution_id = ?1
     ORDER BY name`,
  ).bind(id)
  // A client that names its Resolution gets both reads in one D1 round trip.
  // Without the name, the check read needs the row's Resolution first.
  const [row, checkRows] = resolutionId
    ? await dependencies.db.batch([rowStatement, checksStatement(resolutionId)])
        .then(([rows, checks]) => [
          (rows?.results[0] as ArtifactGrantRow | undefined) ?? null,
          (checks?.results ?? []) as ArtifactCheckRow[],
        ] as const)
    : await rowStatement.first<ArtifactGrantRow>().then(async found => [
        found,
        found ? (await checksStatement(found.resolution_id).all<ArtifactCheckRow>()).results : [],
      ] as const)
  if (!row)
    return { _tag: 'not-found' }
  if (row.delivery_status === 'revoked' || row.resolution_state === 'revoked')
    return { _tag: 'denied', code: 'ARTIFACT_REVOKED' }
  if (row.delivery_status !== 'available' || row.resolution_state !== 'ready')
    return { _tag: 'denied', code: 'CHECK_BLOCKED' }

  const checks = checkRows.map(check => checkResultSchema.parse({
    name: check.name,
    version: check.version,
    outcome: check.outcome,
    required: check.required === 1,
    summary: check.summary ?? undefined,
    findings: JSON.parse(check.findings_json) as unknown,
  }))
  if (checksBlockArtifact(checks))
    return { _tag: 'denied', code: 'CHECK_BLOCKED' }

  const attestation = artifactAttestationSchema.parse(JSON.parse(row.attestation_json))
  if (
    attestation.artifactId !== artifactId
    || attestation.contentSha256 !== row.content_sha256
    || attestation.contentBytes !== row.content_bytes
    || artifactId !== `sha256:${row.content_sha256}`
    || row.r2_key !== artifactR2Key(row.content_sha256)
  ) {
    return { _tag: 'denied', code: 'ARTIFACT_REVOKED' }
  }
  if (!await verifyArtifactAttestation(attestation, dependencies.trustedRoot, dependencies.now))
    return { _tag: 'denied', code: 'ATTESTATION_EXPIRED' }
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
