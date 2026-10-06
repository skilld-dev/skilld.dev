import type { ArtifactAttestationStatement, SourceRequest } from '../../layers/artifact-delivery/server/schemas/contracts'
import type { ArtifactBuildDependencies } from '../../layers/artifact-delivery/server/utils/build'
import type { GithubObjectCache } from '../../layers/artifact-delivery/server/utils/github-source'
import type { TrustedRoot } from '../../layers/artifact-delivery/server/utils/trusted-root'
import type { ArtifactSignerBindings } from '../../workers/artifact-signer/src/handler'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import { artifactAttestationSchema } from '../../layers/artifact-delivery/server/schemas/contracts'
import {
  completeAttestation,
  createArtifactSigner,
  createAttestationSignaturePayload,
  encodeAttestationStatement,
} from '../../layers/artifact-delivery/server/utils/attestation'
import { processArtifactBuild } from '../../layers/artifact-delivery/server/utils/build'
import { bytesToBase64Url, gitBlobShaHex } from '../../layers/artifact-delivery/server/utils/encoding'
import { createPublicGithubSourceClient } from '../../layers/artifact-delivery/server/utils/github-source'
import { ARTIFACT_BUILD_QUEUE_NAME, consumeArtifactBuildBatch, createKvGithubObjectCache } from '../../layers/artifact-delivery/server/utils/queue'
import {
  ARTIFACT_POLICY_VERSION,
  createResolution,
  getResolution,
  resolutionRequestIdentity,
  transitionResolution,
} from '../../layers/artifact-delivery/server/utils/state'
import { createDeterministicUstar } from '../../layers/artifact-delivery/server/utils/ustar'
import { handleArtifactSignerRequest } from '../../workers/artifact-signer/src/handler'
import { createSqliteD1 } from './helpers/d1-sqlite'

/**
 * GitHub reads per run, counted at the fetch boundary of the real source
 * client. Launch traffic repeats the same Skills, and a spent GitHub quota is
 * the only failure class production has shown.
 */

const NOW = 1_787_227_200
const MIGRATIONS = [
  'migrations/0017_users.sql',
  'migrations/0110_artifact_delivery.sql',
  'migrations/0111_github_app_delivery.sql',
  'migrations/0112_private_artifact_keys.sql',
  'migrations/0122_artifact_resolution_retry_after.sql',
  'migrations/0131_artifact_build_reuse.sql',
]
const REPOSITORY_ID = 123456789
const COMMIT = '0123456789abcdef0123456789abcdef01234567'
const ROOT_TREE = '1'.repeat(40)
const SKILLS_TREE = '2'.repeat(40)
const DEMO_TREE = '3'.repeat(40)
const OTHER_TREE = '4'.repeat(40)
const SKILL_MD = new TextEncoder().encode('---\nname: demo\ndescription: Use this Skill for demo work.\n---\n\n# Demo\n')
const OTHER_MD = new TextEncoder().encode('---\nname: other\ndescription: Use this Skill for other work.\n---\n\n# Other\n')

const pinned: SourceRequest = {
  provider: 'github',
  owner: 'skilld-dev',
  repository: 'skills',
  selector: { type: 'path', path: 'skills/demo' },
  ref: { type: 'commit', value: COMMIT },
}
const onBranch: SourceRequest = { ...pinned, ref: { type: 'branch', value: 'main' } }

describe('gitHub reads per run', () => {
  it('reads a commit and its trees from GitHub once', async () => {
    const harness = await createHarness()
    await harness.run(onBranch)
    harness.github.reset()

    const repeat = await harness.run(onBranch)

    expect(repeat.row.state).toBe('ready')
    // Before: repository, ref and commit. The commit never changes.
    expect(harness.github.paths()).toEqual([
      '/repos/skilld-dev/skills',
      '/repos/skilld-dev/skills/git/ref/heads/main',
    ])
    harness.close()
  })

  it('reads only the new folder of another Skill at a built commit', async () => {
    const harness = await createHarness()
    await harness.run(pinned)
    harness.github.reset()

    const other = await harness.run({ ...pinned, selector: { type: 'path', path: 'skills/other' } })

    expect(other.row.state).toBe('ready')
    expect(harness.github.paths()).toEqual([
      '/repos/skilld-dev/skills',
      '/repos/skilld-dev/skills',
      `/repos/skilld-dev/skills/git/trees/${OTHER_TREE}?recursive=1`,
      `/repos/skilld-dev/skills/tarball/${COMMIT}`,
    ])
    harness.close()
  })
})

// #481 changed only checks, yet its policy bump made every ready build load
// from GitHub again. R2 still held the exact bytes of each one.
describe('a policy bump that changes only checks', () => {
  it('checks the stored bytes again instead of reading GitHub', async () => {
    const harness = await createHarness()
    const first = await harness.run(pinned)
    await harness.resign(first.row.id, statement => ({
      ...statement,
      policyVersion: '2026-08-20.1',
      checkResults: statement.checkResults.map(check => check.name === 'agent-skills-spec'
        ? { ...check, version: '2026-08-20', required: true }
        : check),
    }))
    harness.github.reset()

    const repeat = await harness.run(pinned)

    expect(repeat.row.state).toBe('ready')
    expect(harness.github.paths()).toEqual([])
    expect(repeat.row.artifact_id).toBe(first.row.artifact_id)
    const attestation = artifactAttestationSchema.parse(JSON.parse(repeat.row.attestation_json!))
    expect(attestation.policyVersion).toBe(ARTIFACT_POLICY_VERSION)
    expect(attestation.checkResults.find(check => check.name === 'agent-skills-spec'))
      .toMatchObject({ version: '2026-10-07', required: false })
    harness.close()
  })

  it('loads from GitHub when the stored build left a file out', async () => {
    const harness = await createHarness()
    const first = await harness.run(pinned)
    await harness.resign(first.row.id, statement => ({
      ...statement,
      policyVersion: '2026-10-07.1',
      checkResults: statement.checkResults.map(check => check.name === 'omitted-files'
        ? { ...check, outcome: 'warn' as const, summary: '1 file over the size limits was left out of the Artifact.' }
        : check),
    }))
    harness.github.reset()

    const repeat = await harness.run(pinned)

    expect(repeat.row.state).toBe('ready')
    expect(harness.github.paths()).toContain(`/repos/skilld-dev/skills/tarball/${COMMIT}`)
    harness.close()
  })

  it('loads from GitHub again after a bump that changed the bytes', async () => {
    const harness = await createHarness()
    const first = await harness.run(pinned)
    await harness.resign(first.row.id, statement => ({ ...statement, policyVersion: '2026-01-01.0' }))
    harness.github.reset()

    const repeat = await harness.run(pinned)

    expect(repeat.row.state).toBe('ready')
    expect(harness.github.paths()).toContain(`/repos/skilld-dev/skills/tarball/${COMMIT}`)
    harness.close()
  })
})

describe('two first runs of one Skill', () => {
  it('lets the second wait for the first build, then reuse it', async () => {
    const harness = await createHarness()
    const leader = await harness.request(pinned)
    const follower = await harness.request(pinned)
    await harness.begin(leader)

    const waited = await harness.process(follower)

    expect(waited).toEqual({ _tag: 'deferred', resolutionId: follower, delaySeconds: 2 })
    expect(harness.github.paths()).toEqual([])
    expect(await harness.process(leader)).toEqual({ _tag: 'ready', resolutionId: leader })
    harness.github.reset()
    expect(await harness.process(follower)).toEqual({ _tag: 'ready', resolutionId: follower })
    expect(harness.github.paths()).toEqual([])
    harness.close()
  })

  it('waits for a first run on a branch that resolved to the same commit', async () => {
    const harness = await createHarness()
    const leader = await harness.request(onBranch)
    const follower = await harness.request(onBranch)
    await harness.begin(leader)
    await harness.beginFetching(leader)

    const waited = await harness.process(follower)

    expect(waited).toMatchObject({ _tag: 'deferred' })
    // It resolved its branch, then waited instead of loading the same commit.
    expect(harness.github.paths()).toEqual([
      '/repos/skilld-dev/skills',
      '/repos/skilld-dev/skills/git/ref/heads/main',
      `/repos/skilld-dev/skills/commits/${COMMIT}`,
    ])
    harness.close()
  })

  it('builds alone when the first build stalls', async () => {
    const harness = await createHarness()
    const leader = await harness.request(pinned)
    const follower = await harness.request(pinned)
    await harness.begin(leader)
    harness.advanceClock(91)

    expect(await harness.process(follower)).toEqual({ _tag: 'ready', resolutionId: follower })
    harness.close()
  })

  it('requeues a waiting build as a new message, so the wait spends no retry', async () => {
    const harness = await createHarness()
    const leader = await harness.request(pinned)
    const follower = await harness.request(pinned)
    await harness.begin(leader)
    const send = vi.fn(async () => undefined)
    const message = { body: { version: 1, resolutionId: follower }, attempts: 1, ack: vi.fn(), retry: vi.fn() }

    await consumeArtifactBuildBatch(
      { ARTIFACT_BUILD_QUEUE: { send } } as unknown as Cloudflare.Env,
      { queue: ARTIFACT_BUILD_QUEUE_NAME, messages: [message] } as unknown as Parameters<typeof consumeArtifactBuildBatch>[1],
      () => harness.dependencies(),
    )

    expect(send).toHaveBeenCalledWith({ version: 1, resolutionId: follower }, { delaySeconds: 2 })
    expect(message.ack).toHaveBeenCalledOnce()
    expect(message.retry).not.toHaveBeenCalled()
    harness.close()
  })
})

describe('the KV store for immutable GitHub answers', () => {
  it('reads GitHub when KV fails, so a KV outage never fails a build', async () => {
    const cache = createKvGithubObjectCache({
      get: vi.fn(async () => Promise.reject(new Error('KV GET failed: 503'))),
      put: vi.fn(async () => Promise.reject(new Error('KV PUT failed: 503'))),
    } as unknown as KVNamespace)
    const github = await fakeGithub()
    const client = createPublicGithubSourceClient({ fetch: github.fetch, cache })

    const result = await client.resolve(pinned)

    expect(result).toMatchObject({ _tag: 'resolved', source: { commitSha: COMMIT, treeSha: ROOT_TREE } })
    expect(github.paths()).toContain(`/repos/skilld-dev/skills/commits/${COMMIT}`)
  })
})

async function createHarness() {
  const sqlite = createSqliteD1(MIGRATIONS)
  const storage = memoryBucket()
  const github = await fakeGithub()
  const cache = memoryCache()
  let clock = NOW
  let requests = 0
  const signing = await signingKey('skilld-production-2026-08')
  const signerBindings: ArtifactSignerBindings = {
    DB: sqlite.db,
    PUBLIC_ARTIFACTS: storage,
    PRIVATE_ARTIFACTS: storage,
    ARTIFACT_SIGNING_MAX_AGE_SECONDS: '300',
    ...signing.bindings,
  }
  const signer = createArtifactSigner({
    fetch: async (request: Request) => await handleArtifactSignerRequest(request, signerBindings, () => clock),
  } as unknown as Fetcher)

  function dependencies(): ArtifactBuildDependencies {
    return {
      db: sqlite.db,
      github: createPublicGithubSourceClient({ fetch: github.fetch, cache, now: () => clock }),
      bucket: storage,
      signer,
      trustedRoot: signing.trustedRoot,
      now: () => clock,
      reportReuse: () => {},
    }
  }

  async function request(sourceRequest: SourceRequest): Promise<string> {
    requests += 1
    const identity = await resolutionRequestIdentity(sourceRequest, `github-reads-request-${requests}`)
    const created = await createResolution(sqlite.db, sourceRequest, identity, clock)
    if (created._tag === 'idempotency-conflict')
      throw new Error('Test Resolution conflicted')
    clock += 1
    return created.row.id
  }

  async function load(resolutionId: string) {
    const row = await getResolution(sqlite.db, resolutionId)
    if (!row)
      throw new Error('Test Resolution was not stored')
    return row
  }

  return {
    github,
    dependencies,
    request,
    process: async (resolutionId: string) => await processArtifactBuild(dependencies(), resolutionId),
    async run(sourceRequest: SourceRequest) {
      const resolutionId = await request(sourceRequest)
      const outcome = await processArtifactBuild(dependencies(), resolutionId)
      return { outcome, row: await load(resolutionId) }
    },
    /** A build that a queue consumer picked up and has not finished. */
    async begin(resolutionId: string) {
      await transitionResolution(sqlite.db, await load(resolutionId), 'resolving', {}, clock)
    },
    /** That build resolved its source on GitHub and is loading it. */
    async beginFetching(resolutionId: string) {
      await transitionResolution(sqlite.db, await load(resolutionId), 'fetching', {
        repositoryId: REPOSITORY_ID,
        resolvedOwner: 'skilld-dev',
        resolvedRepository: 'skills',
        commitSha: COMMIT,
        treeSha: ROOT_TREE,
        skillPath: 'skills/demo',
      }, clock)
    },
    /** Replace a ready build's attestation with an edited statement the key signs. */
    async resign(resolutionId: string, edit: (statement: ArtifactAttestationStatement) => ArtifactAttestationStatement) {
      const row = await load(resolutionId)
      const { statement: _statement, signature: _signature, ...statement } = artifactAttestationSchema.parse(JSON.parse(row.attestation_json!))
      const raw = encodeAttestationStatement(edit(statement))
      const signature = await crypto.subtle.sign(
        'Ed25519',
        signing.privateKey,
        await createAttestationSignaturePayload(new TextEncoder().encode(raw)),
      )
      const attestation = completeAttestation(raw, {
        algorithm: 'Ed25519',
        keyId: signing.keyId,
        value: bytesToBase64Url(new Uint8Array(signature)),
      })
      sqlite.raw.prepare('UPDATE artifact_resolutions SET attestation_json = ? WHERE id = ?')
        .run(JSON.stringify(attestation), resolutionId)
    },
    advanceClock: (seconds: number) => {
      clock += seconds
    },
    close: sqlite.close,
  }
}

/** One public Repository with two Skills at one commit, served the way api.github.com answers. */
async function fakeGithub() {
  const demoBlob = await gitBlobShaHex(SKILL_MD)
  const otherBlob = await gitBlobShaHex(OTHER_MD)
  const tarball = gzipSync(createDeterministicUstar([
    { path: `skilld-dev-skills-0123456/skills/demo/SKILL.md`, mode: 420, bytes: SKILL_MD, gitBlobSha: demoBlob },
    { path: `skilld-dev-skills-0123456/skills/other/SKILL.md`, mode: 420, bytes: OTHER_MD, gitBlobSha: otherBlob },
  ]))
  const base = '/repos/skilld-dev/skills'
  const routes = new Map<string, () => Response>([
    [base, () => json({ id: REPOSITORY_ID, name: 'skills', owner: { login: 'skilld-dev' }, private: false, default_branch: 'main' })],
    [`${base}/git/ref/heads/main`, () => json({ ref: 'refs/heads/main', object: { type: 'commit', sha: COMMIT } })],
    [`${base}/commits/${COMMIT}`, () => json({ sha: COMMIT, commit: { tree: { sha: ROOT_TREE } } })],
    [`${base}/git/trees/${ROOT_TREE}`, () => json({ sha: ROOT_TREE, tree: [{ path: 'skills', mode: '040000', type: 'tree', sha: SKILLS_TREE }] })],
    [`${base}/git/trees/${SKILLS_TREE}`, () => json({ sha: SKILLS_TREE, tree: [
      { path: 'demo', mode: '040000', type: 'tree', sha: DEMO_TREE },
      { path: 'other', mode: '040000', type: 'tree', sha: OTHER_TREE },
    ] })],
    [`${base}/git/trees/${DEMO_TREE}?recursive=1`, () => json({ sha: DEMO_TREE, truncated: false, tree: [
      { path: 'SKILL.md', mode: '100644', type: 'blob', sha: demoBlob, size: SKILL_MD.byteLength },
    ] })],
    [`${base}/git/trees/${OTHER_TREE}?recursive=1`, () => json({ sha: OTHER_TREE, truncated: false, tree: [
      { path: 'SKILL.md', mode: '100644', type: 'blob', sha: otherBlob, size: OTHER_MD.byteLength },
    ] })],
    [`${base}/tarball/${COMMIT}`, () => new Response(Uint8Array.from(tarball), { status: 200 })],
  ])
  let requested: string[] = []
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    const path = `${url.pathname}${url.search}`
    requested.push(path)
    return routes.get(path)?.() ?? json({ message: 'Not Found' }, 404)
  }) as unknown as typeof globalThis.fetch
  return {
    fetch,
    paths: () => [...requested],
    reset: () => {
      requested = []
    },
  }
}

function memoryCache(): GithubObjectCache {
  const entries = new Map<string, string>()
  return {
    get: async key => entries.has(key) ? JSON.parse(entries.get(key)!) as unknown : null,
    put: async (key, value) => {
      entries.set(key, JSON.stringify(value))
    },
  }
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
}

/** An R2 bucket in memory that computes checksums from the bytes, as R2 does. */
function memoryBucket(): R2Bucket {
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
  return {
    put: async (key: string, value: Uint8Array, options?: R2PutOptions) => {
      if (objects.has(key))
        return null
      objects.set(key, { bytes: Uint8Array.from(value), customMetadata: options?.customMetadata ?? {} })
      return describe(key)
    },
    head: async (key: string) => describe(key),
    get: async (key: string) => {
      const object = describe(key)
      const stored = objects.get(key)
      return object && stored ? { ...object, arrayBuffer: async () => Uint8Array.from(stored.bytes).buffer } : null
    },
  } as unknown as R2Bucket
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
