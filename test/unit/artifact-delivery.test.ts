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
  encodeAttestationStatement,
  verifyAttestationSignature,
} from '../../layers/artifact-delivery/server/utils/attestation'
import { processArtifactBuild } from '../../layers/artifact-delivery/server/utils/build'
import { base64ToBytes, bytesToBase64Url } from '../../layers/artifact-delivery/server/utils/encoding'
import { createPublicArtifactGrant } from '../../layers/artifact-delivery/server/utils/grant'
import {
  createResolution,
  resolutionRequestIdentity,
} from '../../layers/artifact-delivery/server/utils/state'
import { createDeterministicUstar } from '../../layers/artifact-delivery/server/utils/ustar'
import { createSqliteD1 } from './helpers/d1-sqlite'

const NOW = 1_787_227_200
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
    const { signature: _signature, ...statement } = attestation
    const signature = base64ToBytes(attestation.signature.value)
    const exactBytes = new TextEncoder().encode(stored.attestation_statement_json)
    const wrongKeyPair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])
    const wrongPublicKey = bytesToBase64Url(
      new Uint8Array(await crypto.subtle.exportKey('raw', wrongKeyPair.publicKey)),
    )
    const wrongRoot = {
      ...harness.dependencies.trustedRoot,
      keys: harness.dependencies.trustedRoot.keys.map(key => ({ ...key, publicKey: wrongPublicKey })),
    }

    expect(await crypto.subtle.verify('Ed25519', harness.publicKey, signature, exactBytes)).toBe(true)
    expect(stored.attestation_statement_json).toBe(encodeAttestationStatement(statement))
    expect(await verifyAttestationSignature(
      statement,
      attestation.signature,
      harness.dependencies.trustedRoot,
      NOW,
    )).toBe(true)
    expect(await verifyAttestationSignature(
      { ...statement, contentBytes: statement.contentBytes + 1 },
      attestation.signature,
      harness.dependencies.trustedRoot,
      NOW,
    )).toBe(false)
    expect(await verifyAttestationSignature(statement, attestation.signature, wrongRoot, NOW)).toBe(false)
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
    const sqlite = createSqliteD1(['migrations/0110_artifact_delivery.sql'])
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

  it('rejects unknown fields at the request boundary', () => {
    const result = createResolutionRequestSchema.safeParse({
      source: sourceRequest,
      bypassChecks: true,
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

  it('rejects an attempted overwrite of an immutable R2 key', async () => {
    const bucket = {
      put: vi.fn(async () => null),
      head: vi.fn(async () => ({
        size: 4,
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

async function createBuildHarness(files: ArtifactSourceFile[]) {
  const sqlite = createSqliteD1(['migrations/0110_artifact_delivery.sql'])
  const identity = await resolutionRequestIdentity(sourceRequest, 'test-idempotency-key-0001')
  const created = await createResolution(sqlite.db, sourceRequest, identity, NOW)
  if (created._tag === 'idempotency-conflict')
    throw new Error('Test Resolution conflicted')
  const github: PublicGithubSourceClient = {
    resolve: vi.fn(async () => ({ _tag: 'resolved', source: resolvedSource })),
    load: vi.fn(async () => ({ _tag: 'loaded', value: { source: resolvedSource, files } })),
  }
  const put = vi.fn(async () => ({}) as R2Object)
  const bucket = {
    put,
    head: vi.fn(async () => null),
  } as R2Bucket
  const keyPair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])
  const publicKey = bytesToBase64Url(
    new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey)),
  )
  const trustedRoot = {
    version: 1 as const,
    rootKeyId: 'skilld-root-2026',
    rootPublicKey: publicKey,
    keys: [{
      keyId: 'skilld-production-2026-03',
      algorithm: 'Ed25519' as const,
      publicKey,
      notBefore: new Date((NOW - 60) * 1000).toISOString(),
      notAfter: new Date((NOW + 3600) * 1000).toISOString(),
      status: 'active' as const,
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
      new TextEncoder().encode(staged.attestation_statement_json),
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
    bucket,
    signer: { sign },
    trustedRoot,
    now: () => NOW,
  }
  return {
    dependencies,
    resolutionId: created.row.id,
    raw: sqlite.raw,
    put,
    sign,
    publicKey: keyPair.publicKey,
    close: sqlite.close,
  }
}
