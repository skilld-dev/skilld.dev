import type { CheckResult, ResolvedSource } from '../../layers/artifact-delivery/server/schemas/contracts'
import type { ArtifactSignerBindings } from '../../workers/artifact-signer/src/handler'
import { describe, expect, it, vi } from 'vitest'
import { artifactR2Key } from '../../layers/artifact-delivery/server/utils/artifact-storage'
import {
  createAttestationSignaturePayload,
  createAttestationStatement,
  encodeAttestationStatement,
} from '../../layers/artifact-delivery/server/utils/attestation'
import { SIGNABLE_ARTIFACT_POLICIES } from '../../layers/artifact-delivery/server/utils/checks'
import { bytesToBase64Url, digestHex } from '../../layers/artifact-delivery/server/utils/encoding'
import { ARTIFACT_POLICY_VERSION } from '../../layers/artifact-delivery/server/utils/state'
import {
  ARTIFACT_SIGNER_MAX_REQUEST_BYTES,
  handleArtifactSignerRequest,
} from '../../workers/artifact-signer/src/handler'
import artifactSignerWorker from '../../workers/artifact-signer/src/index'
import { createSqliteD1 } from './helpers/d1-sqlite'

const NOW = 1_787_227_200
const ARTIFACT_MIGRATIONS = [
  'migrations/0017_users.sql',
  'migrations/0110_artifact_delivery.sql',
  'migrations/0111_github_app_delivery.sql',
  'migrations/0112_private_artifact_keys.sql',
]
const RESOLUTION_ID = '018f3e3e-10d8-7f41-8d5c-10d2a8f92311'
const source: ResolvedSource = {
  provider: 'github',
  repositoryId: 123456789,
  owner: 'skilld-dev',
  repository: 'skills',
  visibility: 'public',
  commitSha: '0123456789abcdef0123456789abcdef01234567',
  treeSha: '89abcdef0123456789abcdef0123456789abcdef',
  skillPath: 'skills/demo',
}

describe('artifact signing Worker', () => {
  it('signs only the exact staged statement digest', async () => {
    const fixture = await createSignerFixture()

    const response = await handleArtifactSignerRequest(attestRequest(fixture.artifactId), fixture.bindings, () => NOW)
    const signature = await readSuccess(response)
    const payload = await createAttestationSignaturePayload(new TextEncoder().encode(fixture.statement))

    expect(response.status).toBe(200)
    expect(signature).toMatchObject({ algorithm: 'Ed25519', keyId: 'skilld-production-2026-08' })
    expect(await crypto.subtle.verify(
      'Ed25519',
      fixture.publicKey,
      decodeBase64Url(signature.value),
      payload,
    )).toBe(true)
    fixture.close()
  })

  it('returns the same signature when the same signing state replays', async () => {
    const fixture = await createSignerFixture()

    const first = await readSuccess(await handleArtifactSignerRequest(attestRequest(fixture.artifactId), fixture.bindings, () => NOW))
    const replay = await readSuccess(await handleArtifactSignerRequest(attestRequest(fixture.artifactId), fixture.bindings, () => NOW))

    expect(replay).toEqual(first)
    fixture.close()
  })

  it('signs private statements only after exact ciphertext verification', async () => {
    const fixture = await createSignerFixture({ privateArtifact: true })

    const response = await handleArtifactSignerRequest(attestRequest(fixture.artifactId), fixture.bindings, () => NOW)

    expect(response.status).toBe(200)
    expect(fixture.getObject).toHaveBeenCalledOnce()
    fixture.close()
  })

  it.each(['fail', 'error'] as const)('rejects a required %s check before loading the key', async (outcome) => {
    const fixture = await createSignerFixture({ privateKey: 'invalid', checkOutcome: outcome })

    const response = await handleArtifactSignerRequest(attestRequest(fixture.artifactId), fixture.bindings, () => NOW)

    expect(await readCode(response)).toBe('CHECKS_BLOCKED')
    fixture.close()
  })

  it('rejects stale check results', async () => {
    const fixture = await createSignerFixture({ updatedAt: NOW - 301 })

    const response = await handleArtifactSignerRequest(attestRequest(fixture.artifactId), fixture.bindings, () => NOW)

    expect(await readCode(response)).toBe('CHECK_RESULTS_STALE')
    fixture.close()
  })

  it('rejects another Artifact identity', async () => {
    const fixture = await createSignerFixture()
    const wrongArtifactId = `sha256:${'f'.repeat(64)}`

    const response = await handleArtifactSignerRequest(attestRequest(wrongArtifactId), fixture.bindings, () => NOW)

    expect(await readCode(response)).toBe('ARTIFACT_ID_MISMATCH')
    fixture.close()
  })

  it('rejects an unknown Resolution identity', async () => {
    const fixture = await createSignerFixture()
    const request = new Request('https://artifact-signer.internal/v1/attest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        resolutionId: '018f3e3e-10d8-7f41-8d5c-10d2a8f92312',
        artifactId: fixture.artifactId,
      }),
    })

    const response = await handleArtifactSignerRequest(request, fixture.bindings, () => NOW)

    expect(await readCode(response)).toBe('RESOLUTION_NOT_FOUND')
    fixture.close()
  })

  it('rejects a Resolution outside signing state', async () => {
    const fixture = await createSignerFixture()
    fixture.raw.prepare('UPDATE artifact_resolutions SET state = \'publishing\' WHERE id = ?').run(RESOLUTION_ID)

    const response = await handleArtifactSignerRequest(attestRequest(fixture.artifactId), fixture.bindings, () => NOW)

    expect(await readCode(response)).toBe('RESOLUTION_NOT_SIGNABLE')
    fixture.close()
  })

  it('rejects a staged statement changed after checks', async () => {
    const fixture = await createSignerFixture()
    const changed = JSON.parse(fixture.statement) as Record<string, unknown>
    changed.contentBytes = Number(changed.contentBytes) + 1
    fixture.raw.prepare('UPDATE artifact_resolutions SET attestation_statement_json = ? WHERE id = ?')
      .run(JSON.stringify(changed), RESOLUTION_ID)

    const response = await handleArtifactSignerRequest(attestRequest(fixture.artifactId), fixture.bindings, () => NOW)

    expect(await readCode(response)).toBe('STATEMENT_CHANGED')
    fixture.close()
  })

  it('rejects a staged statement from another policy', async () => {
    const fixture = await createSignerFixture()
    const changed = JSON.parse(fixture.statement) as Record<string, unknown>
    changed.policyVersion = 'outdated-policy'
    fixture.raw.prepare('UPDATE artifact_resolutions SET attestation_statement_json = ? WHERE id = ?')
      .run(JSON.stringify(changed), RESOLUTION_ID)

    const response = await handleArtifactSignerRequest(attestRequest(fixture.artifactId), fixture.bindings, () => NOW)

    expect(await readCode(response)).toBe('POLICY_OUTDATED')
    fixture.close()
  })

  // The deploy updates the signer before the site, and a failed smoke rolls
  // the site back alone. In both windows the running site stages statements
  // under the policy before the signer's. The signer refused every one, so a
  // deploy that bumped the policy failed each run in its window.
  it('signs a statement the site staged under the previous policy', async () => {
    const [policyVersion, checkSet] = [...SIGNABLE_ARTIFACT_POLICIES].find(([version]) => version !== ARTIFACT_POLICY_VERSION)!
    const fixture = await createSignerFixture({
      policyVersion,
      checks: [...checkSet].map(([name, check]) => ({ name, version: check.version, outcome: 'pass' as const, required: check.required })),
    })

    const response = await handleArtifactSignerRequest(attestRequest(fixture.artifactId), fixture.bindings, () => NOW)

    expect(response.status).toBe(200)
    fixture.close()
  })

  it('rejects check results the previous policy does not carry', async () => {
    const [policyVersion, checkSet] = [...SIGNABLE_ARTIFACT_POLICIES].find(([version]) => version !== ARTIFACT_POLICY_VERSION)!
    const fixture = await createSignerFixture({
      policyVersion,
      checks: [...checkSet].map(([name, check]) => ({
        name,
        version: name === 'credential-material' ? 'an-older-version' : check.version,
        outcome: 'pass' as const,
        required: check.required,
      })),
    })

    const response = await handleArtifactSignerRequest(attestRequest(fixture.artifactId), fixture.bindings, () => NOW)

    expect(await readCode(response)).toBe('CHECKS_BLOCKED')
    fixture.close()
  })

  it.each([
    ['size', { sizeOffset: 1 }],
    ['stored digest', { storedDigest: 'f'.repeat(64) }],
    ['custom metadata', { metadataDigest: 'f'.repeat(64) }],
    ['bytes', { body: new TextEncoder().encode('mutated') }],
  ] as const)('rejects an R2 %s mismatch', async (_name, objectChange) => {
    const fixture = await createSignerFixture({ objectChange })

    const response = await handleArtifactSignerRequest(attestRequest(fixture.artifactId), fixture.bindings, () => NOW)

    expect(await readCode(response)).toBe('ARTIFACT_BYTES_MISMATCH')
    fixture.close()
  })

  it('rejects D1 state changed while R2 bytes are checked', async () => {
    const fixture = await createSignerFixture({ changeStateAfterObjectRead: true })

    const response = await handleArtifactSignerRequest(attestRequest(fixture.artifactId), fixture.bindings, () => NOW)

    expect(await readCode(response)).toBe('STATE_CHANGED')
    fixture.close()
  })

  it.each([
    ['before', NOW + 1, NOW + 3600],
    ['after', NOW - 3600, NOW],
  ] as const)('rejects a key %s its validity window', async (_name, notBefore, notAfter) => {
    const fixture = await createSignerFixture({ notBefore, notAfter })

    const response = await handleArtifactSignerRequest(attestRequest(fixture.artifactId), fixture.bindings, () => NOW)

    expect(await readCode(response)).toBe('SIGNING_KEY_NOT_ACTIVE')
    fixture.close()
  })

  it('rejects malformed and oversized bodies before D1 access', async () => {
    const fixture = await createSignerFixture()
    const malformed = new Request('https://artifact-signer.internal/v1/attest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    })
    const oversized = new Request('https://artifact-signer.internal/v1/attest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ padding: 'x'.repeat(ARTIFACT_SIGNER_MAX_REQUEST_BYTES) }),
    })

    expect(await readCode(await handleArtifactSignerRequest(malformed, fixture.bindings, () => NOW))).toBe('INVALID_REQUEST')
    expect(await readCode(await handleArtifactSignerRequest(oversized, fixture.bindings, () => NOW))).toBe('REQUEST_TOO_LARGE')
    expect(fixture.getObject).not.toHaveBeenCalled()
    fixture.close()
  })

  it('exposes only POST /v1/attest', async () => {
    const fixture = await createSignerFixture()

    const missing = await artifactSignerWorker.fetch(new Request('https://artifact-signer.internal/'), fixture.bindings)
    const wrongMethod = await artifactSignerWorker.fetch(new Request('https://artifact-signer.internal/v1/attest'), fixture.bindings)

    expect(missing.status).toBe(404)
    expect(wrongMethod.status).toBe(405)
    expect(wrongMethod.headers.get('allow')).toBe('POST')
    fixture.close()
  })
})

interface SignerFixtureOptions {
  changeStateAfterObjectRead?: boolean
  checkOutcome?: 'pass' | 'fail' | 'error'
  privateKey?: string
  updatedAt?: number
  notBefore?: number
  notAfter?: number
  objectChange?: {
    sizeOffset?: number
    storedDigest?: string
    metadataDigest?: string
    body?: Uint8Array
  }
  privateArtifact?: boolean
  policyVersion?: string
  checks?: CheckResult[]
}

async function createSignerFixture(options: SignerFixtureOptions = {}) {
  const sqlite = createSqliteD1(ARTIFACT_MIGRATIONS)
  if (options.privateArtifact) {
    sqlite.raw.prepare(
      `INSERT INTO users (
         id, github_id, login, digest_frequency, digest_hour, timezone,
         created_at, last_login_at
       ) VALUES (1, 101, 'fixture', 'weekly', 9, 'UTC', ?, ?)`,
    ).run(NOW, NOW)
  }
  const artifactBytes = new TextEncoder().encode('immutable Artifact bytes')
  const contentSha256 = await digestHex('SHA-256', artifactBytes)
  const artifactId = `sha256:${contentSha256}`
  const privateCiphertext = new TextEncoder().encode('encrypted private Artifact bytes')
  const ciphertextSha256 = await digestHex('SHA-256', privateCiphertext)
  const r2Key = options.privateArtifact
    ? `v1/private/account/${RESOLUTION_ID}.bin`
    : artifactR2Key(contentSha256)
  const checks: CheckResult[] = options.checks ?? [
    { name: 'path-policy', version: '1', outcome: options.checkOutcome ?? 'pass', required: true },
    { name: 'agent-skills-spec', version: '2026-10-07', outcome: 'pass', required: false },
    { name: 'credential-material', version: '2', outcome: 'pass', required: true },
    { name: 'executable-files', version: '1', outcome: 'pass', required: false },
    { name: 'omitted-files', version: '1', outcome: 'pass', required: false },
  ]
  const statement = encodeAttestationStatement({
    ...createAttestationStatement({
      artifactId,
      createdAt: new Date((NOW - 60) * 1000).toISOString(),
      source: options.privateArtifact ? { ...source, visibility: 'private' } : source,
      contentSha256,
      contentBytes: artifactBytes.byteLength,
      files: [{ path: 'SKILL.md', mode: 420, size: 1, sha256: 'a'.repeat(64) }],
      checkResults: checks.map(check => ({ ...check })),
    }),
    ...(options.policyVersion ? { policyVersion: options.policyVersion } : {}),
  })
  sqlite.raw.prepare(
    `INSERT INTO artifact_resolutions (
       id, request_fingerprint, state, state_version,
       requested_owner, requested_repository, selector_type, selector_value,
       repository_id, resolved_owner, resolved_repository, commit_sha, tree_sha,
       skill_path, artifact_id, content_sha256, content_bytes, r2_key,
       check_results_json, attestation_statement_json, created_at, updated_at,
       visibility, account_id, ciphertext_sha256, ciphertext_bytes, encryption_key_id
     ) VALUES (
       ?, ?, 'signing', 7, ?, ?, 'path', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
       ?, ?, ?, ?, ?
     )`,
  ).run(
    RESOLUTION_ID,
    'fixture',
    source.owner,
    source.repository,
    source.skillPath,
    source.repositoryId,
    source.owner,
    source.repository,
    source.commitSha,
    source.treeSha,
    source.skillPath,
    artifactId,
    contentSha256,
    artifactBytes.byteLength,
    r2Key,
    JSON.stringify(checks),
    statement,
    NOW - 60,
    options.updatedAt ?? NOW,
    options.privateArtifact ? 'private' : 'public',
    options.privateArtifact ? 1 : null,
    options.privateArtifact ? ciphertextSha256 : null,
    options.privateArtifact ? privateCiphertext.byteLength : null,
    options.privateArtifact ? 'account-fixture' : null,
  )

  const keyPair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])
  const privateKey = options.privateKey ?? bytesToBase64Url(
    new Uint8Array(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)),
  )
  const objectChange = options.objectChange ?? {}
  const expectedObject = options.privateArtifact ? privateCiphertext : artifactBytes
  const body = objectChange.body ?? expectedObject
  const expectedStoredDigest = options.privateArtifact ? ciphertextSha256 : contentSha256
  const storedDigest = objectChange.storedDigest ?? expectedStoredDigest
  const metadataDigest = objectChange.metadataDigest ?? contentSha256
  const getObject = vi.fn(async () => {
    if (options.changeStateAfterObjectRead) {
      sqlite.raw.prepare('UPDATE artifact_resolutions SET state_version = state_version + 1 WHERE id = ?')
        .run(RESOLUTION_ID)
    }
    return {
      size: expectedObject.byteLength + (objectChange.sizeOffset ?? 0),
      checksums: { sha256: hexBytes(storedDigest).buffer },
      customMetadata: {
        ...(options.privateArtifact
          ? {
              accountIdHash: await digestHex('SHA-256', '1'),
              artifactId,
              ciphertextSha256,
              contentSha256: metadataDigest,
              encryptionKeyId: 'account-fixture',
              format: 'skilld-private-artifact-v1',
              resolutionId: RESOLUTION_ID,
            }
          : { contentSha256: metadataDigest, format: 'skilld-tar-v1' }),
      },
      arrayBuffer: async () => Uint8Array.from(body).buffer,
      body: new Blob([Uint8Array.from(body)]).stream(),
    } as R2ObjectBody
  })
  const bindings = {
    DB: sqlite.db,
    PUBLIC_ARTIFACTS: { get: getObject } as R2Bucket,
    PRIVATE_ARTIFACTS: { get: getObject } as R2Bucket,
    ARTIFACT_SIGNING_KEY_ID: 'skilld-production-2026-08',
    ARTIFACT_SIGNING_KEY_NOT_BEFORE: new Date((options.notBefore ?? NOW - 60) * 1000).toISOString(),
    ARTIFACT_SIGNING_KEY_NOT_AFTER: new Date((options.notAfter ?? NOW + 3600) * 1000).toISOString(),
    ARTIFACT_SIGNING_MAX_AGE_SECONDS: '300',
    ARTIFACT_SIGNING_PRIVATE_KEY_PKCS8: privateKey,
  } satisfies ArtifactSignerBindings
  return {
    artifactId,
    bindings,
    close: sqlite.close,
    getObject,
    publicKey: keyPair.publicKey,
    raw: sqlite.raw,
    statement,
  }
}

function attestRequest(artifactId: string): Request {
  return new Request('https://artifact-signer.internal/v1/attest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ resolutionId: RESOLUTION_ID, artifactId }),
  })
}

async function readSuccess(response: Response): Promise<{ algorithm: 'Ed25519', keyId: string, value: string }> {
  return await response.json() as { algorithm: 'Ed25519', keyId: string, value: string }
}

async function readCode(response: Response): Promise<string> {
  const body = await response.json() as { code: string }
  return body.code
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  return Uint8Array.from(atob(normalized + '='.repeat((4 - normalized.length % 4) % 4)), value => value.charCodeAt(0))
}

function hexBytes(value: string): Uint8Array {
  return Uint8Array.from(value.match(/.{2}/g) ?? [], byte => Number.parseInt(byte, 16))
}
