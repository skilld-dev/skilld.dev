import type { SourceRequest } from '../../layers/artifact-delivery/server/schemas/contracts'
import type { ArtifactBuildDependencies, ArtifactBuildReuseReport } from '../../layers/artifact-delivery/server/utils/build'
import type { TrustedRoot } from '../../layers/artifact-delivery/server/utils/trusted-root'
import type { ArtifactSignerBindings } from '../../workers/artifact-signer/src/handler'
import type { TarFixtureEntry } from '../fixtures/tar-archive'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { artifactAttestationSchema } from '../../layers/artifact-delivery/server/schemas/contracts'
import { ARTIFACT_SPOOL_BYTES } from '../../layers/artifact-delivery/server/utils/artifact-pack'
import { createArtifactSigner } from '../../layers/artifact-delivery/server/utils/attestation'
import { processArtifactBuild } from '../../layers/artifact-delivery/server/utils/build'
import { bytesToBase64Url } from '../../layers/artifact-delivery/server/utils/encoding'
import { createPublicGithubSourceClient } from '../../layers/artifact-delivery/server/utils/github-source'
import { createResolution, getResolution, resolutionRequestIdentity } from '../../layers/artifact-delivery/server/utils/state'
import { compareArtifactPaths, createDeterministicUstar } from '../../layers/artifact-delivery/server/utils/ustar'
import { handleArtifactSignerRequest } from '../../workers/artifact-signer/src/handler'
import { tarGzFixture } from '../fixtures/tar-archive'
import { createSqliteD1 } from './helpers/d1-sqlite'

/**
 * Skills larger than one build may hold in memory, built end to end through
 * the real source client, packer, R2 writes, and signer.
 */

const NOW = 1_787_227_200
const MIB = 1024 * 1024
const MIGRATIONS = [
  'migrations/0017_users.sql',
  'migrations/0110_artifact_delivery.sql',
  'migrations/0111_github_app_delivery.sql',
  'migrations/0112_private_artifact_keys.sql',
  'migrations/0122_artifact_resolution_retry_after.sql',
  'migrations/0131_artifact_build_reuse.sql',
  'migrations/0145_artifact_resolution_linked_files.sql',
]
const REPOSITORY_ID = 987654321
const COMMIT = '0123456789abcdef0123456789abcdef01234567'
const ROOT_TREE = '1'.repeat(40)
const SKILLS_TREE = '2'.repeat(40)
const BRAG_TREE = '3'.repeat(40)
const encoder = new TextEncoder()
const SKILL_MD = encoder.encode('---\nname: brag\ndescription: Use this Skill to film a brag reel.\n---\n\n# Brag\n')

const request: SourceRequest = {
  provider: 'github',
  owner: 'latent-spaces',
  repository: 'brag',
  selector: { type: 'path', path: 'skills/brag' },
  ref: { type: 'commit', value: COMMIT },
}

describe('a Skill over the in-memory size', () => {
  it('streams its archive into R2 and signs it, with every music file', async () => {
    // latent-spaces/brag packs to 16 MiB with its music. This one passes the
    // size a scan keeps, so the store reads the archive a second time.
    const music = patterned(ARTIFACT_SPOOL_BYTES + MIB)
    const harness = await createHarness([
      ['SKILL.md', SKILL_MD],
      ['assets/music/happy-beats.mp3', music],
      ['scripts/render.ts', encoder.encode('export const reel = true\n')],
    ])

    const built = await harness.run(false)

    expect(built.outcome).toEqual({ _tag: 'ready', resolutionId: built.row.id })
    const attestation = artifactAttestationSchema.parse(JSON.parse(built.row.attestation_json!))
    expect(attestation.files.map(file => file.path)).toEqual(['SKILL.md', 'assets/music/happy-beats.mp3', 'scripts/render.ts'])
    expect(attestation.checkResults.find(check => check.name === 'omitted-files')).toMatchObject({ outcome: 'pass' })
    expect(harness.archiveReads()).toBe(2)
    // Compared by digest: a byte-by-byte diff of 17 MiB takes vitest half a minute.
    const stored = harness.stored(attestation.contentSha256)
    const inMemory = createDeterministicUstar(harness.files.map(([path, bytes]) => ({ path, mode: 420, bytes, gitBlobSha: gitBlobSha(bytes) })))
    expect(sha256(stored!)).toBe(sha256(inMemory))
    expect(sha256(stored!)).toBe(attestation.contentSha256)
    harness.close()
  })

  it('fails as retryable, and stores nothing, when the second read serves other bytes', async () => {
    const harness = await createHarness([
      ['SKILL.md', SKILL_MD],
      ['assets/music/happy-beats.mp3', patterned(ARTIFACT_SPOOL_BYTES + MIB)],
    ], { changeOnSecondRead: 'skills/brag/assets/music/happy-beats.mp3' })

    const built = await harness.run(false)

    expect(built.row).toMatchObject({ state: 'failed', error_code: 'SOURCE_UNAVAILABLE', error_retryable: 1 })
    expect(harness.storedKeys()).toEqual([])
    harness.close()
  })
})

describe('a Skill over the 64 MiB archive limit', () => {
  // thvroyal/kimi-skills/kimi-xlsx runs a 73 MiB binary. The archive never
  // needs its bytes: a CLI either reads it from GitHub or does without it.
  const binary: readonly [string, number] = ['scripts/KimiXlsx', 77_001_601]

  it('lists the binary as a linked file for a CLI that reads them', async () => {
    const harness = await createHarness([['SKILL.md', SKILL_MD], ['scripts/run.py', encoder.encode('print(1)\n')]], { unpacked: [binary] })

    const built = await harness.run(true)

    expect(built.row.state).toBe('ready')
    const attestation = artifactAttestationSchema.parse(JSON.parse(built.row.attestation_json!))
    expect(attestation.linkedFiles).toEqual([{ path: 'scripts/KimiXlsx', mode: 420, size: 77_001_601, gitBlobSha: harness.unpackedSha('scripts/KimiXlsx') }])
    expect(attestation.files.map(file => file.path)).toEqual(['SKILL.md', 'scripts/run.py'])
    expect(attestation.checkResults.find(check => check.name === 'omitted-files')).toMatchObject({ outcome: 'pass' })
    harness.close()
  })

  it('leaves the binary out for any other CLI, and names it', async () => {
    const harness = await createHarness([['SKILL.md', SKILL_MD], ['scripts/run.py', encoder.encode('print(1)\n')]], { unpacked: [binary] })

    const built = await harness.run(false)

    expect(built.row.state).toBe('ready')
    const attestation = artifactAttestationSchema.parse(JSON.parse(built.row.attestation_json!))
    expect(attestation).not.toHaveProperty('linkedFiles')
    expect(attestation.checkResults.find(check => check.name === 'omitted-files')).toMatchObject({
      outcome: 'warn',
      findings: [`scripts/KimiXlsx: 77,001,601 bytes, https://github.com/latent-spaces/brag/blob/${COMMIT}/skills/brag/scripts/KimiXlsx`],
    })
    harness.close()
  })

  it('never reuses a build made for the other kind of CLI', async () => {
    const harness = await createHarness([['SKILL.md', SKILL_MD]], { unpacked: [binary] })
    const omitting = await harness.run(false)
    harness.reports.length = 0

    const linking = await harness.run(true)
    const omittingAgain = await harness.run(false)

    expect(linking.row.state).toBe('ready')
    expect(linking.row.attestation_json).not.toBe(omitting.row.attestation_json)
    expect(harness.reports).toContainEqual(expect.objectContaining({ _tag: 'miss', reason: 'linked-files-differ' }))
    expect(artifactAttestationSchema.parse(JSON.parse(omittingAgain.row.attestation_json!))).not.toHaveProperty('linkedFiles')
    harness.close()
  })

  it('reuses one build for both kinds of CLI when nothing is linked or left out', async () => {
    const harness = await createHarness([['SKILL.md', SKILL_MD], ['assets/music/happy-beats.mp3', patterned(3 * MIB)]])
    await harness.run(false)
    harness.reports.length = 0

    const linking = await harness.run(true)

    expect(linking.row.state).toBe('ready')
    expect(harness.reports).toContainEqual(expect.objectContaining({ _tag: 'hit' }))
    expect(harness.archiveReads()).toBe(1)
    harness.close()
  })
})

type SkillFiles = Array<[string, Uint8Array]>

async function createHarness(
  files: SkillFiles,
  options: { unpacked?: ReadonlyArray<readonly [string, number]>, changeOnSecondRead?: string } = {},
) {
  const sqlite = createSqliteD1(MIGRATIONS)
  const storage = memoryBucket()
  const github = fakeGithub(files, options)
  const reports: ArtifactBuildReuseReport[] = []
  let clock = NOW
  let requests = 0
  const signing = await signingKey('skilld-production-2026-08')
  const signerBindings: ArtifactSignerBindings = {
    DB: sqlite.db,
    PUBLIC_ARTIFACTS: storage.bucket,
    PRIVATE_ARTIFACTS: storage.bucket,
    ARTIFACT_SIGNING_MAX_AGE_SECONDS: '300',
    ...signing.bindings,
  }
  const signer = createArtifactSigner({
    fetch: async (signed: Request) => await handleArtifactSignerRequest(signed, signerBindings, () => clock),
  } as unknown as Fetcher)
  const dependencies = (): ArtifactBuildDependencies => ({
    db: sqlite.db,
    github: createPublicGithubSourceClient({ fetch: github.fetch, now: () => clock }),
    bucket: storage.bucket,
    signer,
    trustedRoot: signing.trustedRoot,
    now: () => clock,
    reportReuse: report => reports.push(report),
    // Node has no `FixedLengthStream`. R2 reads the same bytes from either.
    fixedLengthStream: () => new TransformStream<Uint8Array, Uint8Array>(),
  })

  return {
    files,
    reports,
    archiveReads: () => github.archiveReads(),
    stored: (contentSha256: string) => storage.bytes(contentSha256),
    storedKeys: () => storage.keys(),
    unpackedSha: (path: string) => github.unpackedSha(path),
    async run(linkedFiles: boolean) {
      requests += 1
      const identity = await resolutionRequestIdentity(request, `large-build-request-${requests}`, undefined, linkedFiles)
      const created = await createResolution(sqlite.db, request, identity, clock, { visibility: 'public' }, linkedFiles)
      if (created._tag === 'idempotency-conflict')
        throw new Error('Test Resolution conflicted')
      clock += 1
      const outcome = await processArtifactBuild(dependencies(), created.row.id)
      const row = await getResolution(sqlite.db, created.row.id)
      return { outcome, row: row! }
    },
    close: sqlite.close,
  }
}

/** One public Repository with one Skill folder, served the way GitHub answers. */
function fakeGithub(
  files: SkillFiles,
  options: { unpacked?: ReadonlyArray<readonly [string, number]>, changeOnSecondRead?: string },
) {
  const unpacked = new Map((options.unpacked ?? []).map(([path]) => [path, createHash('sha1').update(`unpacked ${path}`).digest('hex')]))
  const treeEntries = [
    ...files.map(([path, bytes]) => ({ path, mode: '100644', type: 'blob', sha: gitBlobSha(bytes), size: bytes.byteLength })),
    ...(options.unpacked ?? []).map(([path, size]) => ({ path, mode: '100644', type: 'blob', sha: unpacked.get(path)!, size })),
  ]
  const archive = (changed: boolean): Uint8Array => {
    const entries: TarFixtureEntry[] = [...files]
      .sort(([left], [right]) => compareArtifactPaths(left, right))
      .map(([path, bytes]) => {
        const full = `skills/brag/${path}`
        return { path: full, bytes: changed && full === options.changeOnSecondRead ? flipFirstByte(bytes) : bytes }
      })
    return tarGzFixture(`brag-${COMMIT}`, entries, { globalComment: COMMIT })
  }
  let archiveReads = 0
  const base = '/repos/latent-spaces/brag'
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
  const fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    if (url.hostname === 'codeload.github.com' && url.pathname === `/latent-spaces/brag/tar.gz/${COMMIT}`) {
      archiveReads += 1
      return new Response(archive(archiveReads > 1), { status: 200 })
    }
    const path = `${url.pathname}${url.search}`
    if (path === base)
      return json({ id: REPOSITORY_ID, name: 'brag', owner: { login: 'latent-spaces' }, private: false, default_branch: 'main' })
    if (path === `${base}/commits/${COMMIT}`)
      return json({ sha: COMMIT, commit: { tree: { sha: ROOT_TREE } } })
    if (path === `${base}/git/trees/${ROOT_TREE}`)
      return json({ sha: ROOT_TREE, tree: [{ path: 'skills', mode: '040000', type: 'tree', sha: SKILLS_TREE }] })
    if (path === `${base}/git/trees/${SKILLS_TREE}`)
      return json({ sha: SKILLS_TREE, tree: [{ path: 'brag', mode: '040000', type: 'tree', sha: BRAG_TREE }] })
    if (path === `${base}/git/trees/${BRAG_TREE}?recursive=1`)
      return json({ sha: BRAG_TREE, truncated: false, tree: treeEntries })
    return json({ message: 'Not Found' }, 404)
  }) as unknown as typeof globalThis.fetch
  return {
    fetch,
    archiveReads: () => archiveReads,
    unpackedSha: (path: string) => unpacked.get(path)!,
  }
}

/** An R2 bucket in memory that reads streams and checks the SHA-256 it is given, as R2 does. */
function memoryBucket() {
  const objects = new Map<string, { bytes: Uint8Array, customMetadata: Record<string, string> }>()
  const describe = (key: string) => {
    const object = objects.get(key)
    if (!object)
      return null
    return {
      key,
      size: object.bytes.byteLength,
      checksums: { sha256: Uint8Array.from(createHash('sha256').update(object.bytes).digest()).buffer },
      customMetadata: object.customMetadata,
    }
  }
  const bucket = {
    put: async (key: string, value: Uint8Array | ReadableStream<Uint8Array>, options?: R2PutOptions) => {
      const bytes = value instanceof ReadableStream ? concat(await Array.fromAsync(value)) : Uint8Array.from(value)
      const expected = options?.sha256 ? Buffer.from(options.sha256 as Uint8Array).toString('hex') : null
      if (expected && sha256(bytes) !== expected)
        throw new Error('put: The SHA-256 checksum you specified did not match what we received.')
      if (objects.has(key))
        return null
      objects.set(key, { bytes, customMetadata: options?.customMetadata ?? {} })
      return describe(key)
    },
    head: async (key: string) => describe(key),
    get: async (key: string) => {
      const object = describe(key)
      const stored = objects.get(key)
      if (!object || !stored)
        return null
      return {
        ...object,
        body: new Blob([Uint8Array.from(stored.bytes)]).stream(),
        arrayBuffer: async () => Uint8Array.from(stored.bytes).buffer,
      }
    },
  } as unknown as R2Bucket
  return {
    bucket,
    keys: () => [...objects.keys()],
    bytes: (contentSha256: string) => [...objects.entries()].find(([key]) => key.includes(contentSha256))?.[1].bytes ?? null,
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
      statement: bytesToBase64Url(encoder.encode(JSON.stringify({ keyId }))),
      rootSignature: 'C'.repeat(86),
    }],
    fetchedAt: new Date(NOW * 1000).toISOString(),
  }
  return {
    trustedRoot,
    bindings: {
      ARTIFACT_SIGNING_KEY_ID: keyId,
      ARTIFACT_SIGNING_KEY_NOT_BEFORE: notBefore,
      ARTIFACT_SIGNING_KEY_NOT_AFTER: notAfter,
      ARTIFACT_SIGNING_PRIVATE_KEY_PKCS8: privateKey,
    },
  }
}

/** Bytes that gzip quickly and that no text check reads as a key. */
function patterned(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  for (let index = 0; index < length; index += 4096)
    bytes[index] = (index / 4096) % 251
  return bytes
}

function flipFirstByte(bytes: Uint8Array): Uint8Array {
  const changed = Uint8Array.from(bytes)
  changed[0] = changed[0]! ^ 0xFF
  return changed
}

function gitBlobSha(bytes: Uint8Array): string {
  return createHash('sha1').update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex')
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function concat(parts: Uint8Array[]): Uint8Array {
  const merged = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0))
  let offset = 0
  for (const part of parts) {
    merged.set(part, offset)
    offset += part.byteLength
  }
  return merged
}
