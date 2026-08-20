import type { ResolvedSource, SourceRequest } from '../../layers/artifact-delivery/server/schemas/contracts'
import type { ArtifactBuildDependencies } from '../../layers/artifact-delivery/server/utils/build'
import type { ArtifactSourceFile, PublicGithubSourceClient } from '../../layers/artifact-delivery/server/utils/github-source'
import { describe, expect, it, vi } from 'vitest'
import {
  artifactAttestationSchema,
  createResolutionRequestSchema,
} from '../../layers/artifact-delivery/server/schemas/contracts'
import { createArtifactProblem } from '../../layers/artifact-delivery/server/utils/artifact-problem'
import { putImmutableArtifact } from '../../layers/artifact-delivery/server/utils/artifact-storage'
import {
  createArtifactSigner,
  createAttestationSignaturePayload,
  verifyArtifactAttestation,
} from '../../layers/artifact-delivery/server/utils/attestation'
import { processArtifactBuild } from '../../layers/artifact-delivery/server/utils/build'
import { checksBlockArtifact } from '../../layers/artifact-delivery/server/utils/checks'
import { base64ToBytes, bytesToBase64Url } from '../../layers/artifact-delivery/server/utils/encoding'
import { createPublicArtifactGrant } from '../../layers/artifact-delivery/server/utils/grant'
import {
  ARTIFACT_BUILD_QUEUE_NAME,
  consumeArtifactBuildBatch,
} from '../../layers/artifact-delivery/server/utils/queue'
import {
  createResolution,
  getResolution,
  resolutionRequestIdentity,
  transitionResolution,
} from '../../layers/artifact-delivery/server/utils/state'
import { createDeterministicUstar } from '../../layers/artifact-delivery/server/utils/ustar'
import { createSqliteD1 } from './helpers/d1-sqlite'

const NOW = 1_787_227_200
const ARTIFACT_MIGRATIONS = [
  'migrations/0017_users.sql',
  'migrations/0110_artifact_delivery.sql',
  'migrations/0111_github_app_delivery.sql',
  'migrations/0112_private_artifact_keys.sql',
]
const sourceRequest: SourceRequest = {
  provider: 'github',
  owner: 'skilld-dev',
  repository: 'skills',
  selector: { type: 'path', path: 'skills/demo' },
  ref: { type: 'commit', value: '0123456789abcdef0123456789abcdef01234567' },
}
const resolvedSource: ResolvedSource = {
  provider: 'github',
  repositoryId: 123456789,
  owner: 'skilld-dev',
  repository: 'skills',
  visibility: 'public',
  commitSha: '0123456789abcdef0123456789abcdef01234567',
  treeSha: '89abcdef0123456789abcdef0123456789abcdef',
  skillPath: 'skills/demo',
}
const validFiles: ArtifactSourceFile[] = [{
  path: 'SKILL.md',
  mode: 420,
  bytes: new TextEncoder().encode('---\nname: demo\ndescription: Use this Skill for demo work.\n---\n\n# Demo\n'),
  gitBlobSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
}]

describe('public Artifact delivery', () => {
  it('blocks failed checks before storage or signing', async () => {
    const harness = await createBuildHarness([{
      ...validFiles[0]!,
      bytes: new TextEncoder().encode('No frontmatter'),
    }])

    const result = await processArtifactBuild(harness.dependencies, harness.resolutionId)

    expect(result).toEqual({ _tag: 'blocked', resolutionId: harness.resolutionId })
    expect(harness.put).not.toHaveBeenCalled()
    expect(harness.sign).not.toHaveBeenCalled()
    harness.close()
  })

  it('does not repeat effects when a Queue delivery is duplicated', async () => {
    const harness = await createBuildHarness(validFiles)

    const first = await processArtifactBuild(harness.dependencies, harness.resolutionId)
    const duplicate = await processArtifactBuild(harness.dependencies, harness.resolutionId)

    expect(first._tag).toBe('ready')
    expect(duplicate._tag).toBe('ready')
    expect(harness.put).toHaveBeenCalledTimes(1)
    expect(harness.sign).toHaveBeenCalledTimes(1)
    harness.close()
  })

  it('retries a failed Queue delivery and resumes its stored state', async () => {
    const harness = await createBuildHarness(validFiles)
    const sign = harness.dependencies.signer.sign
    harness.dependencies.signer = {
      sign: vi.fn()
        .mockRejectedValueOnce(new Error('Signer unavailable'))
        .mockImplementation(sign),
    }
    const first = artifactQueueBatch(harness.resolutionId, 1)
    const replay = artifactQueueBatch(harness.resolutionId, 2)

    await consumeArtifactBuildBatch(
      {} as Cloudflare.Env,
      first.batch,
      () => harness.dependencies,
    )
    await consumeArtifactBuildBatch(
      {} as Cloudflare.Env,
      replay.batch,
      () => harness.dependencies,
    )

    expect(first.retry).toHaveBeenCalledOnce()
    expect(first.ack).not.toHaveBeenCalled()
    expect(replay.ack).toHaveBeenCalledOnce()
    expect(replay.retry).not.toHaveBeenCalled()
    expect((await getResolution(harness.dependencies.db, harness.resolutionId))?.state).toBe('ready')
    harness.close()
  })

  it('signs the exact staged attestation bytes with Ed25519', async () => {
    const harness = await createBuildHarness(validFiles)

    await processArtifactBuild(harness.dependencies, harness.resolutionId)
    const stored = harness.raw.prepare(
      `SELECT attestation_statement_json, attestation_json
       FROM artifact_resolutions
       WHERE id = ?`,
    ).get(harness.resolutionId) as {
      attestation_statement_json: string
      attestation_json: string
    }
    const attestation = artifactAttestationSchema.parse(JSON.parse(stored.attestation_json))
    const signature = base64ToBytes(attestation.signature.value)
    const exactBytes = new TextEncoder().encode(stored.attestation_statement_json)
    const signedPayload = await createAttestationSignaturePayload(exactBytes)
    const wrongKeyPair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])
    const wrongPublicKey = bytesToBase64Url(
      new Uint8Array(await crypto.subtle.exportKey('raw', wrongKeyPair.publicKey)),
    )
    const wrongRoot = {
      ...harness.dependencies.trustedRoot,
      keys: harness.dependencies.trustedRoot.keys.map(key => ({ ...key, publicKey: wrongPublicKey })),
    }

    expect(await crypto.subtle.verify('Ed25519', harness.publicKey, signature, signedPayload)).toBe(true)
    expect(new TextDecoder().decode(base64ToBytes(attestation.statement))).toBe(stored.attestation_statement_json)
    expect(await verifyArtifactAttestation(attestation, harness.dependencies.trustedRoot, NOW)).toBe(true)
    expect(await verifyArtifactAttestation(
      { ...attestation, contentBytes: attestation.contentBytes + 1 },
      harness.dependencies.trustedRoot,
      NOW,
    )).toBe(false)
    expect(await verifyArtifactAttestation(attestation, wrongRoot, NOW)).toBe(false)

    const changedRawBytes = new TextEncoder().encode(`${stored.attestation_statement_json}\n`)
    expect(await verifyArtifactAttestation({
      ...attestation,
      statement: bytesToBase64Url(changedRawBytes),
    }, harness.dependencies.trustedRoot, NOW)).toBe(false)
    expect(await verifyArtifactAttestation({
      ...attestation,
      statement: '_w',
    }, harness.dependencies.trustedRoot, NOW)).toBe(false)
    expect(await verifyArtifactAttestation({
      ...attestation,
      signature: { ...attestation.signature, value: 'A'.repeat(88) },
    }, harness.dependencies.trustedRoot, NOW)).toBe(false)
    harness.close()
  })

  it('does not publish a signature from an untrusted Ed25519 key', async () => {
    const harness = await createBuildHarness(validFiles)
    const otherKeyPair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])
    const otherPublicKey = bytesToBase64Url(
      new Uint8Array(await crypto.subtle.exportKey('raw', otherKeyPair.publicKey)),
    )
    harness.dependencies.trustedRoot = {
      ...harness.dependencies.trustedRoot,
      keys: harness.dependencies.trustedRoot.keys.map(key => ({ ...key, publicKey: otherPublicKey })),
    }

    await expect(processArtifactBuild(harness.dependencies, harness.resolutionId))
      .rejects
      .toThrow('Artifact signer returned an invalid signature')
    expect(harness.raw.prepare('SELECT COUNT(*) AS total FROM artifacts').get()).toEqual({ total: 0 })
    harness.close()
  })

  it('returns a conflict when one idempotency key identifies another request', async () => {
    const sqlite = createSqliteD1(ARTIFACT_MIGRATIONS)
    const identity = await resolutionRequestIdentity(sourceRequest, 'test-idempotency-key-conflict')
    const first = await createResolution(sqlite.db, sourceRequest, identity, NOW)
    const changed = {
      ...sourceRequest,
      selector: { type: 'path' as const, path: 'skills/another' },
    }
    const changedIdentity = await resolutionRequestIdentity(changed, 'test-idempotency-key-conflict')
    const second = await createResolution(sqlite.db, changed, changedIdentity, NOW)

    expect(first._tag).toBe('created')
    expect(second).toEqual({ _tag: 'idempotency-conflict' })
    sqlite.close()
  })

  it('allows only one state transition from a stale D1 version', async () => {
    const sqlite = createSqliteD1(ARTIFACT_MIGRATIONS)
    const identity = await resolutionRequestIdentity(sourceRequest, 'test-idempotency-key-cas-0001')
    const created = await createResolution(sqlite.db, sourceRequest, identity, NOW)
    if (created._tag === 'idempotency-conflict')
      throw new Error('Test Resolution conflicted')
    const stale = await getResolution(sqlite.db, created.row.id)
    if (!stale)
      throw new Error('Test Resolution was not stored')

    const first = await transitionResolution(sqlite.db, stale, 'resolving', {}, NOW)
    const second = await transitionResolution(sqlite.db, stale, 'resolving', {}, NOW)

    expect(first._tag).toBe('advanced')
    expect(second).toEqual({ _tag: 'superseded' })
    sqlite.close()
  })

  it('rejects unknown fields at the request boundary', () => {
    const result = createResolutionRequestSchema.safeParse({
      source: sourceRequest,
      bypassChecks: true,
    })

    expect(result.success).toBe(false)
  })

  it('rejects unknown fields inside a source selector', () => {
    const result = createResolutionRequestSchema.safeParse({
      source: {
        ...sourceRequest,
        selector: { type: 'path', path: 'skills/demo', unchecked: true },
      },
    })

    expect(result.success).toBe(false)
  })

  it('returns the versioned Problem contract for boundary errors', () => {
    const problem = createArtifactProblem({
      statusCode: 409,
      message: 'Artifact delivery is not available',
      data: { code: 'CHECK_BLOCKED' },
    }, `/api/v1/resolutions/${crypto.randomUUID()}`)

    expect(problem).toMatchObject({
      type: 'https://skilld.dev/problems/check-blocked',
      title: 'Artifact checks blocked delivery',
      status: 409,
      code: 'CHECK_BLOCKED',
    })
  })

  it('bounds a signer response without a Content-Length header', async () => {
    const service = {
      fetch: vi.fn(async () => new Response(`{"value":"${'A'.repeat(9000)}"}`)),
    } as Fetcher
    const signer = createArtifactSigner(service)

    await expect(signer.sign({
      resolutionId: crypto.randomUUID(),
      artifactId: `sha256:${'a'.repeat(64)}`,
    })).rejects.toThrow('Artifact signer response exceeded the byte limit')
  })

  it('checks current results before it creates a grant for cached bytes', async () => {
    const harness = await createBuildHarness(validFiles)
    await processArtifactBuild(harness.dependencies, harness.resolutionId)
    const artifact = harness.raw.prepare(
      'SELECT id FROM artifacts LIMIT 1',
    ).get() as { id: string }
    const input = {
      db: harness.dependencies.db,
      trustedRoot: harness.dependencies.trustedRoot,
      publicBaseUrl: 'https://artifacts.skilld.dev',
      now: NOW,
    }

    const before = await createPublicArtifactGrant(input, artifact.id)
    harness.raw.prepare(
      `UPDATE artifact_check_results
       SET outcome = 'fail', required = 1
       WHERE resolution_id = ? AND name = 'path-policy'`,
    ).run(harness.resolutionId)
    const after = await createPublicArtifactGrant(input, artifact.id)

    expect(before._tag).toBe('granted')
    expect(after).toEqual({ _tag: 'denied', code: 'CHECK_BLOCKED' })
    harness.close()
  })

  it('fails closed when a current required check is missing', async () => {
    const harness = await createBuildHarness(validFiles)
    await processArtifactBuild(harness.dependencies, harness.resolutionId)
    const artifact = harness.raw.prepare(
      'SELECT id FROM artifacts LIMIT 1',
    ).get() as { id: string }
    harness.raw.prepare(
      `DELETE FROM artifact_check_results
       WHERE resolution_id = ? AND name = 'path-policy'`,
    ).run(harness.resolutionId)

    const result = await createPublicArtifactGrant({
      db: harness.dependencies.db,
      trustedRoot: harness.dependencies.trustedRoot,
      publicBaseUrl: 'https://artifacts.skilld.dev',
      now: NOW,
    }, artifact.id)

    expect(result).toEqual({ _tag: 'denied', code: 'CHECK_BLOCKED' })
    harness.close()
  })

  it('fails closed when the stored attestation bytes changed', async () => {
    const harness = await createBuildHarness(validFiles)
    await processArtifactBuild(harness.dependencies, harness.resolutionId)
    const artifact = harness.raw.prepare(
      'SELECT id FROM artifacts LIMIT 1',
    ).get() as { id: string }
    const row = harness.raw.prepare(
      'SELECT attestation_json FROM artifact_attestations WHERE resolution_id = ?',
    ).get(harness.resolutionId) as { attestation_json: string }
    const attestation = JSON.parse(row.attestation_json) as Record<string, unknown>
    attestation.policyVersion = 'changed-policy'
    harness.raw.prepare(
      'UPDATE artifact_attestations SET attestation_json = ? WHERE resolution_id = ?',
    ).run(JSON.stringify(attestation), harness.resolutionId)

    const result = await createPublicArtifactGrant({
      db: harness.dependencies.db,
      trustedRoot: harness.dependencies.trustedRoot,
      publicBaseUrl: 'https://artifacts.skilld.dev',
      now: NOW,
    }, artifact.id)

    expect(result).toEqual({ _tag: 'denied', code: 'ATTESTATION_EXPIRED' })
    harness.close()
  })

  it('does not grant a content URL outside the configured public origin', async () => {
    const harness = await createBuildHarness(validFiles)
    await processArtifactBuild(harness.dependencies, harness.resolutionId)
    const artifact = harness.raw.prepare(
      'SELECT id FROM artifacts LIMIT 1',
    ).get() as { id: string }
    harness.raw.prepare(
      'UPDATE artifacts SET r2_key = ? WHERE id = ?',
    ).run('//untrusted.example/archive.tar', artifact.id)

    const result = await createPublicArtifactGrant({
      db: harness.dependencies.db,
      trustedRoot: harness.dependencies.trustedRoot,
      publicBaseUrl: 'https://artifacts.skilld.dev',
      now: NOW,
    }, artifact.id)

    expect(result).toEqual({ _tag: 'denied', code: 'ARTIFACT_REVOKED' })
    harness.close()
  })

  it('treats an empty check set as blocked', () => {
    expect(checksBlockArtifact([])).toBe(true)
  })

  it('rejects an attempted overwrite of an immutable R2 key', async () => {
    const bucket = {
      put: vi.fn(async () => null),
      head: vi.fn(async () => ({
        size: 4,
        checksums: { sha256: Uint8Array.from({ length: 32 }, () => 0xBB).buffer },
        customMetadata: { contentSha256: 'b'.repeat(64), format: 'skilld-tar-v1' },
      })),
    } as R2Bucket

    const result = await putImmutableArtifact(bucket, {
      key: `v1/sha256/aa/${'a'.repeat(64)}.tar`,
      bytes: new Uint8Array([1, 2, 3]),
      contentSha256: 'a'.repeat(64),
    })

    expect(result._tag).toBe('mutation-rejected')
    expect(bucket.put).toHaveBeenCalledWith(
      `v1/sha256/aa/${'a'.repeat(64)}.tar`,
      new Uint8Array([1, 2, 3]),
      expect.objectContaining({ onlyIf: { etagDoesNotMatch: '*' } }),
    )
  })

  it('rejects existing R2 bytes when only their metadata matches', async () => {
    const contentSha256 = 'a'.repeat(64)
    const bucket = {
      put: vi.fn(async () => null),
      head: vi.fn(async () => ({
        size: 3,
        checksums: { sha256: Uint8Array.from({ length: 32 }, () => 0xBB).buffer },
        customMetadata: { contentSha256, format: 'skilld-tar-v1' },
      })),
    } as R2Bucket

    const result = await putImmutableArtifact(bucket, {
      key: `v1/sha256/aa/${contentSha256}.tar`,
      bytes: new Uint8Array([1, 2, 3]),
      contentSha256,
    })

    expect(result).toEqual({
      _tag: 'mutation-rejected',
      key: `v1/sha256/aa/${contentSha256}.tar`,
    })
  })

  it('accepts existing R2 bytes with the same stored SHA-256', async () => {
    const contentSha256 = 'a'.repeat(64)
    const key = `v1/sha256/aa/${contentSha256}.tar`
    const bucket = {
      put: vi.fn(async () => null),
      head: vi.fn(async () => ({
        size: 3,
        checksums: { sha256: Uint8Array.from({ length: 32 }, () => 0xAA).buffer },
        customMetadata: { contentSha256, format: 'skilld-tar-v1' },
      })),
    } as R2Bucket

    const result = await putImmutableArtifact(bucket, {
      key,
      bytes: new Uint8Array([1, 2, 3]),
      contentSha256,
    })

    expect(result).toEqual({ _tag: 'existing', key })
  })

  it('creates identical USTAR bytes for either source order', () => {
    const second: ArtifactSourceFile = {
      path: 'references/guide.md',
      mode: 420,
      bytes: new TextEncoder().encode('guide'),
      gitBlobSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    }

    const firstArchive = createDeterministicUstar([second, ...validFiles])
    const secondArchive = createDeterministicUstar([...validFiles, second])

    expect(firstArchive).toEqual(secondArchive)
  })
})

describe('private Artifact build', () => {
  it('uses private source and storage without writing public R2', async () => {
    const harness = await createBuildHarness(validFiles, true)

    const result = await processArtifactBuild(harness.dependencies, harness.resolutionId)
    const artifact = harness.raw.prepare(
      `SELECT account_id, artifact_id, delivery_status
       FROM private_artifacts
       WHERE resolution_id = ?`,
    ).get(harness.resolutionId)

    expect(result._tag).toBe('ready')
    expect(harness.put).not.toHaveBeenCalled()
    expect(harness.privatePut).toHaveBeenCalledOnce()
    expect(artifact).toMatchObject({ account_id: 1, delivery_status: 'available' })
    harness.close()
  })
})

async function createBuildHarness(files: ArtifactSourceFile[], privateMode = false) {
  const sqlite = createSqliteD1(ARTIFACT_MIGRATIONS)
  if (privateMode) {
    sqlite.raw.prepare(
      `INSERT INTO users (
         id, github_id, login, digest_frequency, digest_hour, timezone,
         created_at, last_login_at
       ) VALUES (1, 101, 'skilld-dev', 'weekly', 9, 'UTC', ?, ?)`,
    ).run(NOW, NOW)
    sqlite.raw.prepare(
      `INSERT INTO github_app_installations (
         installation_id, account_id, github_account_id, state, connected_at, verified_at
       ) VALUES (9001, 1, 101, 'active', ?, ?)`,
    ).run(NOW, NOW)
    sqlite.raw.prepare(
      `INSERT INTO github_app_repositories (
         installation_id, repository_id, owner, repository,
         visibility, state, selected_at
       ) VALUES (9001, 123456789, 'skilld-dev', 'skills', 'private', 'selected', ?)`,
    ).run(NOW)
  }
  const identity = await resolutionRequestIdentity(
    sourceRequest,
    'test-idempotency-key-0001',
    privateMode ? 1 : undefined,
  )
  const created = await createResolution(
    sqlite.db,
    sourceRequest,
    identity,
    NOW,
    privateMode
      ? { visibility: 'private', accountId: 1, installationId: 9001 }
      : { visibility: 'public' },
  )
  if (created._tag === 'idempotency-conflict')
    throw new Error('Test Resolution conflicted')
  const buildSource = privateMode ? { ...resolvedSource, visibility: 'private' as const } : resolvedSource
  const github: PublicGithubSourceClient = {
    resolve: vi.fn(async () => ({ _tag: 'resolved', source: buildSource })),
    load: vi.fn(async () => ({ _tag: 'loaded', value: { source: buildSource, files } })),
  }
  const put = vi.fn(async () => ({}) as R2Object)
  const bucket = {
    put,
    head: vi.fn(async () => null),
  } as R2Bucket
  const privatePut = vi.fn(async () => ({
    _tag: 'stored' as const,
    key: `v1/private/account/${created.row.id}.bin`,
    ciphertextSha256: 'f'.repeat(64),
    ciphertextBytes: 1024,
    encryptionKeyId: 'account-fixture',
  }))
  const keyPair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])
  const publicKey = bytesToBase64Url(
    new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey)),
  )
  const trustedKey = {
    version: 1 as const,
    rootKeyId: 'skilld-root-2026',
    keyId: 'skilld-production-2026-03',
    algorithm: 'Ed25519' as const,
    publicKey,
    notBefore: new Date((NOW - 60) * 1000).toISOString(),
    notAfter: new Date((NOW + 3600) * 1000).toISOString(),
    status: 'active' as const,
  }
  const trustedRoot = {
    version: 1 as const,
    rootKeyId: 'skilld-root-2026',
    rootPublicKey: publicKey,
    keys: [{
      keyId: trustedKey.keyId,
      algorithm: trustedKey.algorithm,
      publicKey: trustedKey.publicKey,
      notBefore: trustedKey.notBefore,
      notAfter: trustedKey.notAfter,
      status: trustedKey.status,
      statement: bytesToBase64Url(new TextEncoder().encode(JSON.stringify(trustedKey))),
      rootSignature: 'C'.repeat(86),
    }],
    fetchedAt: new Date(NOW * 1000).toISOString(),
  }
  const sign = vi.fn(async (input: { resolutionId: string, artifactId: string }) => {
    const staged = sqlite.raw.prepare(
      `SELECT artifact_id, attestation_statement_json
       FROM artifact_resolutions
       WHERE id = ?`,
    ).get(input.resolutionId) as {
      artifact_id: string
      attestation_statement_json: string
    } | undefined
    if (!staged || staged.artifact_id !== input.artifactId)
      throw new Error('Signer fixture received an unknown Artifact identity')
    const signature = await crypto.subtle.sign(
      'Ed25519',
      keyPair.privateKey,
      await createAttestationSignaturePayload(new TextEncoder().encode(staged.attestation_statement_json)),
    )
    return {
      algorithm: 'Ed25519' as const,
      keyId: 'skilld-production-2026-03',
      value: bytesToBase64Url(new Uint8Array(signature)),
    }
  })
  const dependencies: ArtifactBuildDependencies = {
    db: sqlite.db,
    github,
    privateGithub: privateMode ? vi.fn(async () => github) : undefined,
    bucket,
    privateArtifacts: privateMode ? { put: privatePut } : undefined,
    signer: { sign },
    trustedRoot,
    now: () => NOW,
  }
  return {
    dependencies,
    resolutionId: created.row.id,
    raw: sqlite.raw,
    put,
    privatePut,
    sign,
    publicKey: keyPair.publicKey,
    close: sqlite.close,
  }
}

function artifactQueueBatch(resolutionId: string, attempts: number) {
  const ack = vi.fn()
  const retry = vi.fn()
  return {
    ack,
    retry,
    batch: {
      queue: ARTIFACT_BUILD_QUEUE_NAME,
      messages: [{ body: { version: 1, resolutionId }, attempts, ack, retry }],
    } as Parameters<typeof consumeArtifactBuildBatch>[1],
  }
}
