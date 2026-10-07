import type { ArtifactAttestationStatement, ResolvedSource, SourceRequest } from '../../layers/artifact-delivery/server/schemas/contracts'
import type { ArtifactBuildDependencies } from '../../layers/artifact-delivery/server/utils/build'
import type { ArtifactSourceFile, PublicGithubSourceClient, ResolveSourceResult } from '../../layers/artifact-delivery/server/utils/github-source'
import type { ResolutionAccess } from '../../layers/artifact-delivery/server/utils/request-resolution'
import type { ServedResolutionReport } from '../../layers/artifact-delivery/server/utils/served-resolution'
import type { TrustedRoot } from '../../layers/artifact-delivery/server/utils/trusted-root'
import type { ArtifactSignerBindings } from '../../workers/artifact-signer/src/handler'
import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { artifactAttestationSchema, createResolutionResponseSchema } from '../../layers/artifact-delivery/server/schemas/contracts'
import {
  completeAttestation,
  createArtifactSigner,
  createAttestationSignaturePayload,
  encodeAttestationStatement,
} from '../../layers/artifact-delivery/server/utils/attestation'
import { processArtifactBuild } from '../../layers/artifact-delivery/server/utils/build'
import { bytesToBase64Url } from '../../layers/artifact-delivery/server/utils/encoding'
import { requestResolution } from '../../layers/artifact-delivery/server/utils/request-resolution'
import { serveReadyResolution } from '../../layers/artifact-delivery/server/utils/served-resolution'
import { getResolution, presentResolution } from '../../layers/artifact-delivery/server/utils/state'
import { handleArtifactSignerRequest } from '../../workers/artifact-signer/src/handler'
import { createSqliteD1 } from './helpers/d1-sqlite'

const NOW = 1_787_227_200
const MIGRATIONS = [
  'migrations/0017_users.sql',
  'migrations/0110_artifact_delivery.sql',
  'migrations/0111_github_app_delivery.sql',
  'migrations/0112_private_artifact_keys.sql',
  'migrations/0122_artifact_resolution_retry_after.sql',
  'migrations/0131_artifact_build_reuse.sql',
  'migrations/0144_artifact_resolution_requesters.sql',
  'migrations/0145_artifact_resolution_linked_files.sql',
]
const COMMIT = '0123456789abcdef0123456789abcdef01234567'
const resolved: ResolvedSource = {
  provider: 'github',
  repositoryId: 123456789,
  owner: 'skilld-dev',
  repository: 'skills',
  visibility: 'public',
  commitSha: COMMIT,
  treeSha: '89abcdef0123456789abcdef0123456789abcdef',
  skillPath: 'skills/demo',
}
const pinned: SourceRequest = {
  provider: 'github',
  owner: 'skilld-dev',
  repository: 'skills',
  selector: { type: 'path', path: 'skills/demo' },
  ref: { type: 'commit', value: COMMIT },
}
const onBranch: SourceRequest = { ...pinned, ref: { type: 'branch', value: 'main' } }
const byName: SourceRequest = {
  provider: 'github',
  owner: 'skilld-dev',
  repository: 'skills',
  selector: { type: 'named-skill', name: 'demo' },
}
const files: ArtifactSourceFile[] = [{
  path: 'SKILL.md',
  mode: 420,
  bytes: new TextEncoder().encode('---\nname: demo\ndescription: Use this Skill for demo work.\n---\n\n# Demo\n'),
  gitBlobSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
}]
const PUBLIC: ResolutionAccess = { visibility: 'public' }

describe('serving a warm run from its ready build', () => {
  it('answers a request pinned to a built commit with the ready Resolution, and queues nothing', async () => {
    const harness = await createHarness()
    const first = await harness.buildReady(pinned)
    const enqueue = vi.fn(async () => {})

    const result = await harness.request(pinned, { enqueue })

    expect(result._tag).toBe('served')
    if (result._tag !== 'served')
      throw new Error('not served')
    expect(result.row.id).toBe(first.id)
    expect(enqueue).not.toHaveBeenCalled()
    const answer = createResolutionResponseSchema.parse(presentResolution(result.row))
    expect(answer.state).toBe('ready')
    expect(harness.unbuilt()).toBe(0)
    harness.close()
  })

  it('serves a registry name from its admitted folder and commit, with no GitHub read', async () => {
    const harness = await createHarness()
    await harness.buildReady(pinned)
    const github = vi.fn(async (): Promise<ResolveSourceResult> => ({ _tag: 'resolved', source: resolved }))

    const result = await harness.request(byName, {
      admitted: { skillPath: 'skills/demo', commitSha: COMMIT },
      resolveOnGithub: github,
    })

    expect(result._tag).toBe('served')
    expect(github).not.toHaveBeenCalled()
    harness.close()
  })

  it('resolves a branch to its commit on GitHub, then serves the ready build of that commit', async () => {
    const harness = await createHarness()
    const first = await harness.buildReady(pinned)
    const github = vi.fn(async (): Promise<ResolveSourceResult> => ({ _tag: 'resolved', source: resolved }))

    const result = await harness.request(onBranch, { resolveOnGithub: github })

    expect(github).toHaveBeenCalledWith(onBranch)
    expect(result._tag === 'served' && result.row.id).toBe(first.id)
    harness.close()
  })

  it('builds a resolved branch pinned to its commit when no ready build exists', async () => {
    const harness = await createHarness()
    const enqueue = vi.fn(async () => {})

    const result = await harness.request(onBranch, {
      enqueue,
      resolveOnGithub: async () => ({ _tag: 'resolved', source: resolved }),
    })

    expect(result._tag).toBe('created')
    if (result._tag !== 'created')
      throw new Error('not created')
    expect(result.row).toMatchObject({ ref_type: 'commit', ref_value: COMMIT, selector_type: 'path', selector_value: 'skills/demo' })
    expect(enqueue).toHaveBeenCalledWith(result.row.id)
    expect(harness.reports).toContainEqual({ _tag: 'miss', reason: 'no-ready-build' })
    harness.close()
  })

  it('builds the request as sent when GitHub cannot resolve it in time', async () => {
    const harness = await createHarness()
    await harness.buildReady(pinned)

    const result = await harness.request(onBranch, {
      resolveOnGithub: () => new Promise(() => {}),
      resolveTimeoutMs: 5,
    })

    expect(result._tag).toBe('created')
    if (result._tag !== 'created')
      throw new Error('not created')
    expect(result.row).toMatchObject({ ref_type: 'branch', ref_value: 'main' })
    expect(harness.reports).toContainEqual({ _tag: 'miss', reason: 'github-timeout' })
    harness.close()
  })

  it('does not serve a build signed under another policy', async () => {
    const harness = await createHarness()
    const first = await harness.buildReady(pinned)
    await harness.resign(first.id, statement => ({ ...statement, policyVersion: '2026-01-01.1' }))

    const result = await harness.request(pinned)

    expect(result._tag).toBe('created')
    expect(harness.reports).toContainEqual({ _tag: 'miss', reason: 'policy-changed' })
    harness.close()
  })

  it('does not serve a ready build whose bytes left R2', async () => {
    const harness = await createHarness()
    const first = await harness.buildReady(pinned)
    harness.storage.remove(first.r2_key!)

    const result = await harness.request(pinned)

    expect(result._tag).toBe('created')
    expect(harness.reports).toContainEqual({ _tag: 'miss', reason: 'bytes-missing' })
    harness.close()
  })

  it('never serves a private request', async () => {
    const harness = await createHarness()
    await harness.buildReady(pinned)
    harness.raw.prepare('INSERT INTO users (id, github_id, login, created_at, last_login_at) VALUES (1, 1, ?, ?, ?)').run('private-owner', NOW, NOW)
    const serve = vi.fn()

    const result = await requestResolution({
      db: harness.db,
      lookupAdmitted: async () => null,
      enqueue: async () => {},
      now: () => NOW,
      serveReady: serve,
    }, {
      source: pinned,
      idempotencyKey: 'served-private-request-key',
      access: { visibility: 'private', accountId: 1, installationId: 2, repositoryId: 3 },
    })

    expect(result._tag).toBe('created')
    expect(serve).not.toHaveBeenCalled()
    harness.close()
  })
})

async function createHarness() {
  const sqlite = createSqliteD1(MIGRATIONS)
  const storage = memoryBucket()
  const signing = await signingKey('skilld-production-2026-08')
  const reports: ServedResolutionReport[] = []
  let requests = 0
  const signerBindings: ArtifactSignerBindings = {
    DB: sqlite.db,
    PUBLIC_ARTIFACTS: storage.bucket,
    PRIVATE_ARTIFACTS: storage.bucket,
    ARTIFACT_SIGNING_MAX_AGE_SECONDS: '300',
    ...signing.bindings,
  }
  const buildDependencies: ArtifactBuildDependencies = {
    db: sqlite.db,
    github: {
      resolve: async () => ({ _tag: 'resolved', source: resolved }),
      load: async () => ({ _tag: 'loaded', value: { source: resolved, files } }),
    } satisfies PublicGithubSourceClient,
    bucket: storage.bucket,
    signer: createArtifactSigner({
      fetch: async (request: Request) => await handleArtifactSignerRequest(request, signerBindings, () => NOW),
    } as unknown as Fetcher),
    trustedRoot: signing.trustedRoot,
    now: () => NOW,
    reportReuse: () => {},
  }

  async function request(
    source: SourceRequest,
    options: {
      enqueue?: (resolutionId: string) => Promise<void>
      admitted?: { skillPath: string, commitSha: string | null }
      resolveOnGithub?: (source: SourceRequest) => Promise<ResolveSourceResult>
      resolveTimeoutMs?: number
    } = {},
  ) {
    requests += 1
    return await requestResolution({
      db: sqlite.db,
      lookupAdmitted: async () => options.admitted ?? null,
      enqueue: options.enqueue ?? (async () => {}),
      now: () => NOW,
      serveReady: serveReadyResolution({
        db: sqlite.db,
        bucket: storage.bucket,
        trustedRoot: signing.trustedRoot,
        now: () => NOW,
        resolveOnGithub: options.resolveOnGithub ?? (async () => ({ _tag: 'resolved', source: resolved })),
        resolveTimeoutMs: options.resolveTimeoutMs,
        report: report => reports.push(report),
      }),
    }, { source, idempotencyKey: `served-request-key-${requests}`, access: PUBLIC })
  }

  async function buildReady(source: SourceRequest) {
    const created = await requestResolution({
      db: sqlite.db,
      lookupAdmitted: async () => null,
      enqueue: async () => {},
      now: () => NOW,
    }, { source, idempotencyKey: `served-build-key-${requests++}`, access: PUBLIC })
    if (created._tag === 'idempotency-conflict')
      throw new Error('Test Resolution conflicted')
    await processArtifactBuild(buildDependencies, created.row.id)
    const row = await getResolution(sqlite.db, created.row.id)
    if (row?.state !== 'ready')
      throw new Error(`Test build ended ${row?.state}`)
    return row
  }

  /** Replace a ready build's attestation with a changed statement the same key signs. */
  async function resign(resolutionId: string, edit: (statement: ArtifactAttestationStatement) => ArtifactAttestationStatement) {
    const row = await getResolution(sqlite.db, resolutionId)
    const { statement: _statement, signature: _signature, ...statement } = artifactAttestationSchema.parse(JSON.parse(row!.attestation_json!))
    const rawStatement = encodeAttestationStatement(edit(statement))
    const signature = await crypto.subtle.sign(
      'Ed25519',
      signing.privateKey,
      await createAttestationSignaturePayload(new TextEncoder().encode(rawStatement)),
    )
    const attestation = completeAttestation(rawStatement, {
      algorithm: 'Ed25519',
      keyId: signing.keyId,
      value: bytesToBase64Url(new Uint8Array(signature)),
    })
    sqlite.raw.prepare('UPDATE artifact_resolutions SET attestation_json = ? WHERE id = ?').run(JSON.stringify(attestation), resolutionId)
  }

  return {
    db: sqlite.db,
    raw: sqlite.raw,
    storage,
    reports,
    request,
    buildReady,
    resign,
    /** Resolutions still waiting for a build. */
    unbuilt: () => (sqlite.raw.prepare(`SELECT count(*) AS n FROM artifact_resolutions WHERE state = 'requested'`).get() as { n: number }).n,
    close: sqlite.close,
  }
}

async function signingKey(keyId: string) {
  const keyPair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])
  const publicKey = bytesToBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey)))
  const privateKey = bytesToBase64Url(new Uint8Array(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)))
  const notBefore = new Date((NOW - 60) * 1000).toISOString()
  const notAfter = new Date((NOW + 3600) * 1000).toISOString()
  const trustedRoot: TrustedRoot = {
    version: 1,
    rootKeyId: 'skilld-root-2026',
    rootPublicKey: publicKey,
    keys: [{
      keyId,
      algorithm: 'Ed25519',
      publicKey,
      notBefore,
      notAfter,
      status: 'active',
      statement: bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ keyId }))),
      rootSignature: 'C'.repeat(86),
    }],
    fetchedAt: new Date(NOW * 1000).toISOString(),
  }
  return {
    keyId,
    privateKey: keyPair.privateKey,
    trustedRoot,
    bindings: {
      ARTIFACT_SIGNING_KEY_ID: keyId,
      ARTIFACT_SIGNING_KEY_NOT_BEFORE: notBefore,
      ARTIFACT_SIGNING_KEY_NOT_AFTER: notAfter,
      ARTIFACT_SIGNING_PRIVATE_KEY_PKCS8: privateKey,
    },
  }
}

function memoryBucket() {
  const objects = new Map<string, { bytes: Uint8Array, customMetadata: Record<string, string> }>()
  const describeObject = (key: string) => {
    const object = objects.get(key)
    if (!object)
      return null
    const digest = createHash('sha256').update(object.bytes).digest()
    return {
      key,
      size: object.bytes.byteLength,
      checksums: { sha256: Uint8Array.from(digest).buffer },
      customMetadata: object.customMetadata,
    }
  }
  const bucket = {
    put: async (key: string, value: Uint8Array, options?: R2PutOptions) => {
      if (objects.has(key))
        return null
      objects.set(key, { bytes: Uint8Array.from(value), customMetadata: options?.customMetadata ?? {} })
      return describeObject(key)
    },
    head: async (key: string) => describeObject(key),
    get: async (key: string) => {
      const object = describeObject(key)
      const stored = objects.get(key)
      return object && stored
        ? { ...object, arrayBuffer: async () => Uint8Array.from(stored.bytes).buffer }
        : null
    },
  } as unknown as R2Bucket
  return { bucket, remove: (key: string) => objects.delete(key) }
}
