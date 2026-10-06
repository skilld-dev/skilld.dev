import type {
  ArtifactAttestationStatement,
  ResolvedSource,
  SourceRequest,
} from '../../layers/artifact-delivery/server/schemas/contracts'
import type { ArtifactBuildDependencies, ArtifactBuildReuseReport } from '../../layers/artifact-delivery/server/utils/build'
import type { ArtifactSourceFile, PublicGithubSourceClient } from '../../layers/artifact-delivery/server/utils/github-source'
import type { ResolutionRow } from '../../layers/artifact-delivery/server/utils/state'
import type { TrustedRoot } from '../../layers/artifact-delivery/server/utils/trusted-root'
import type { ArtifactSignerBindings } from '../../workers/artifact-signer/src/handler'
import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  artifactAttestationSchema,
  resolutionSchema,
} from '../../layers/artifact-delivery/server/schemas/contracts'
import {
  completeAttestation,
  createArtifactSigner,
  createAttestationSignaturePayload,
  encodeAttestationStatement,
  verifyArtifactAttestation,
} from '../../layers/artifact-delivery/server/utils/attestation'
import { processArtifactBuild } from '../../layers/artifact-delivery/server/utils/build'
import { bytesToBase64Url } from '../../layers/artifact-delivery/server/utils/encoding'
import { createPublicArtifactGrant } from '../../layers/artifact-delivery/server/utils/grant'
import { ARTIFACT_BUILD_QUEUE_NAME, consumeArtifactBuildBatch } from '../../layers/artifact-delivery/server/utils/queue'
import { resolveSkillPageUrl } from '../../layers/artifact-delivery/server/utils/skill-page'
import {
  createResolution,
  getResolution,
  presentResolution,
  resolutionRequestIdentity,
  transitionResolution,
} from '../../layers/artifact-delivery/server/utils/state'
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
]
const COMMIT = '0123456789abcdef0123456789abcdef01234567'
const NEXT_COMMIT = 'fedcba9876543210fedcba9876543210fedcba98'
const source: ResolvedSource = {
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
const files: ArtifactSourceFile[] = [{
  path: 'SKILL.md',
  mode: 420,
  bytes: new TextEncoder().encode('---\nname: demo\ndescription: Use this Skill for demo work.\n---\n\n# Demo\n'),
  gitBlobSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
}]

describe('reusing a ready public build', () => {
  it('serves a repeat request pinned to a built commit with no GitHub call', async () => {
    const harness = await createReuseHarness()
    const first = await harness.build(pinned, githubServing(source))
    harness.advanceClock(120)
    const github = githubDown()

    const repeat = await harness.build(pinned, github)

    expect(repeat.outcome).toEqual({ _tag: 'ready', resolutionId: repeat.row.id })
    expect(github.resolve).not.toHaveBeenCalled()
    expect(github.load).not.toHaveBeenCalled()
    expect(harness.storage.put).toHaveBeenCalledOnce()
    const response = resolutionSchema.parse(presentResolution(repeat.row))
    if (response.state !== 'ready')
      throw new Error('The repeat Resolution is not ready')
    const attestation = response.artifact.attestation
    expect(await verifyArtifactAttestation(attestation, harness.trustedRoot(), harness.now())).toBe(true)
    expect(response.artifact.artifactId).toBe(first.row.artifact_id)
    expect(attestation.source).toEqual(source)
    expect(attestation.createdAt).toBe(new Date(repeat.row.created_at * 1000).toISOString())
    expect(attestation.createdAt).not.toBe(parseReady(first.row).createdAt)
    expect(harness.reports).toContainEqual({
      _tag: 'hit',
      lookup: 'pinned',
      resolutionId: repeat.row.id,
      reusedFrom: first.row.id,
    })
    harness.close()
  })

  it('asks the registry for the same Skill page as the build it reused', async () => {
    const harness = await createReuseHarness()
    const first = await harness.build(pinned, githubServing(source))
    const repeat = await harness.build(pinned, githubDown())
    const pageUrl = vi.fn(async () => 'https://skilld.dev/gh/skilld-dev/skills/demo')

    const firstUrl = await resolveSkillPageUrl(first.row, pageUrl, reason => expect.fail(reason))
    const repeatUrl = await resolveSkillPageUrl(repeat.row, pageUrl, reason => expect.fail(reason))

    expect(repeatUrl).toBe(firstUrl)
    expect(pageUrl.mock.calls[1]).toEqual(pageUrl.mock.calls[0])
    harness.close()
  })

  it('resolves an unpinned request on GitHub, then skips the load', async () => {
    const harness = await createReuseHarness()
    const first = await harness.build(pinned, githubServing(source))
    const github = githubServing(source)

    const repeat = await harness.build(onBranch, github)

    expect(repeat.row.state).toBe('ready')
    expect(github.resolve).toHaveBeenCalledOnce()
    expect(github.load).not.toHaveBeenCalled()
    expect(harness.reports).toContainEqual({
      _tag: 'hit',
      lookup: 'resolved',
      resolutionId: repeat.row.id,
      reusedFrom: first.row.id,
    })
    harness.close()
  })

  it('does not serve an older build when GitHub cannot resolve an unpinned request', async () => {
    const harness = await createReuseHarness()
    await harness.build(pinned, githubServing(source))
    const resolutionId = await harness.request(onBranch)

    await expect(processArtifactBuild(harness.dependencies(githubDown()), resolutionId))
      .rejects
      .toThrow('The operation was aborted due to timeout')

    expect((await getResolution(harness.db, resolutionId))?.state).toBe('resolving')
    harness.close()
  })

  it('loads a different commit from GitHub', async () => {
    const harness = await createReuseHarness()
    await harness.build(pinned, githubServing(source))
    const next = { ...source, commitSha: NEXT_COMMIT }
    const github = githubServing(next)

    const built = await harness.build({ ...pinned, ref: { type: 'commit', value: NEXT_COMMIT } }, github)

    expect(built.row.state).toBe('ready')
    expect(github.resolve).toHaveBeenCalledOnce()
    expect(github.load).toHaveBeenCalledOnce()
    expect(parseReady(built.row).source.commitSha).toBe(NEXT_COMMIT)
    harness.close()
  })

  it('resolves a pinned Skill name on GitHub until a build of that name exists', async () => {
    const harness = await createReuseHarness()
    await harness.build(pinned, githubServing(source))
    const named: SourceRequest = { ...pinned, selector: { type: 'named-skill', name: 'demo' } }
    const firstNamed = githubServing(source)
    const secondNamed = githubDown()

    const first = await harness.build(named, firstNamed)
    const second = await harness.build(named, secondNamed)

    expect(first.row.state).toBe('ready')
    expect(firstNamed.resolve).toHaveBeenCalledOnce()
    expect(firstNamed.load).not.toHaveBeenCalled()
    expect(second.row.state).toBe('ready')
    expect(secondNamed.resolve).not.toHaveBeenCalled()
    harness.close()
  })

  it('loads again when the ready build was signed under a policy that packed other bytes', async () => {
    const harness = await createReuseHarness()
    const first = await harness.build(pinned, githubServing(source))
    await harness.resignReadyBuild(first.row.id, statement => ({ ...statement, policyVersion: '2026-01-01.0' }))
    const github = githubServing(source)

    const repeat = await harness.build(pinned, github)

    expect(repeat.row.state).toBe('ready')
    expect(github.load).toHaveBeenCalledOnce()
    expect(harness.reports).toContainEqual({ _tag: 'miss', lookup: 'pinned', resolutionId: repeat.row.id, reason: 'policy-changed' })
    harness.close()
  })

  it('checks the stored bytes again when the ready build was signed under another check version', async () => {
    const harness = await createReuseHarness()
    const first = await harness.build(pinned, githubServing(source))
    await harness.resignReadyBuild(first.row.id, statement => ({
      ...statement,
      checkResults: statement.checkResults.map(check => check.name === 'agent-skills-spec'
        ? { ...check, version: '2026-01-01' }
        : check),
    }))
    const github = githubServing(source)

    const repeat = await harness.build(pinned, github)

    expect(repeat.row.state).toBe('ready')
    expect(github.resolve).not.toHaveBeenCalled()
    expect(github.load).not.toHaveBeenCalled()
    expect(harness.reports).toContainEqual({ _tag: 'recheck', lookup: 'pinned', resolutionId: repeat.row.id, reusedFrom: first.row.id })
    harness.close()
  })

  it('loads again after its signing key leaves the trusted root', async () => {
    const harness = await createReuseHarness()
    await harness.build(pinned, githubServing(source))
    await harness.rotateSigningKey()
    const github = githubServing(source)

    const repeat = await harness.build(pinned, github)

    expect(github.load).toHaveBeenCalledOnce()
    expect(harness.reports).toContainEqual({
      _tag: 'miss',
      lookup: 'pinned',
      resolutionId: repeat.row.id,
      reason: 'attestation-untrusted',
    })
    expect(await verifyArtifactAttestation(parseReady(repeat.row), harness.trustedRoot(), harness.now())).toBe(true)
    harness.close()
  })

  it.each([
    {
      prior: 'revoked Resolution',
      spoil: async (harness: ReuseHarness, row: ResolutionRow) => {
        await transitionResolution(harness.db, row, 'revoked', { errorCode: 'ARTIFACT_REVOKED' }, harness.now())
      },
    },
    {
      prior: 'revoked Artifact',
      spoil: async (harness: ReuseHarness, row: ResolutionRow) => {
        harness.raw.prepare('UPDATE artifacts SET delivery_status = \'revoked\' WHERE id = ?').run(row.artifact_id)
      },
    },
  ])('loads again rather than reuse a $prior', async ({ spoil }) => {
    const harness = await createReuseHarness()
    const first = await harness.build(pinned, githubServing(source))
    await spoil(harness, first.row)
    const github = githubServing(source)

    const repeat = await harness.build(pinned, github)

    expect(repeat.row.state).toBe('ready')
    expect(github.load).toHaveBeenCalledOnce()
    harness.close()
  })

  it('loads again rather than reuse a failed build of the same commit', async () => {
    const harness = await createReuseHarness()
    const failedId = await harness.request(pinned)
    const signerDown = {
      ...harness.dependencies(githubServing(source)),
      signer: { sign: vi.fn(async () => Promise.reject(new Error('Artifact signer returned 503'))) },
    }
    await consumeArtifactBuildBatch({} as Cloudflare.Env, queueBatch([failedId], 5), () => signerDown)
    expect((await getResolution(harness.db, failedId))?.state).toBe('failed')
    const github = githubServing(source)

    const repeat = await harness.build(pinned, github)

    expect(repeat.row.state).toBe('ready')
    expect(github.load).toHaveBeenCalledOnce()
    harness.close()
  })

  it('loads again when the stored bytes are gone', async () => {
    const harness = await createReuseHarness()
    const first = await harness.build(pinned, githubServing(source))
    harness.storage.remove(first.row.r2_key!)
    const github = githubServing(source)

    const repeat = await harness.build(pinned, github)

    expect(repeat.row.state).toBe('ready')
    expect(github.load).toHaveBeenCalledOnce()
    expect(harness.storage.put).toHaveBeenCalledTimes(2)
    expect(harness.reports).toContainEqual({
      _tag: 'miss',
      lookup: 'pinned',
      resolutionId: repeat.row.id,
      reason: 'bytes-missing',
    })
    harness.close()
  })

  it.each([
    { recorded: 'the reused check results', edit: (checks: string) => checks, loads: 0, result: 'ready' },
    // The fresh load cannot match what the row recorded either, so the signer
    // refuses the statement. The point is that GitHub was asked.
    {
      recorded: 'other check results',
      edit: (checks: string) => checks.replace('"pass"', '"warn"'),
      loads: 1,
      result: 'Artifact signer returned 409',
    },
  ])('resumes a Resolution left in packaging with $recorded', async ({ edit, loads, result }) => {
    const harness = await createReuseHarness()
    const first = await harness.build(pinned, githubServing(source))
    const resolutionId = await harness.request(pinned)
    // A new invocation picks up a Resolution that an earlier one left in `packaging`.
    let row = (await getResolution(harness.db, resolutionId))!
    for (const [next, patch] of [
      ['resolving', {}],
      ['fetching', {
        repositoryId: source.repositoryId,
        resolvedOwner: source.owner,
        resolvedRepository: source.repository,
        commitSha: source.commitSha,
        treeSha: source.treeSha,
        skillPath: source.skillPath,
      }],
      ['checking', { checkResultsJson: edit(first.row.check_results_json!) }],
      ['packaging', {}],
    ] as const) {
      const advanced = await transitionResolution(harness.db, row, next, patch, harness.now())
      if (advanced._tag !== 'advanced')
        throw new Error('Test Resolution was superseded')
      row = advanced.row
    }
    const github = githubServing(source)

    const outcome = await processArtifactBuild(harness.dependencies(github), resolutionId)
      .then(value => value._tag, (error: Error) => error.message)

    expect(github.resolve).not.toHaveBeenCalled()
    expect(github.load).toHaveBeenCalledTimes(loads)
    expect(outcome).toBe(result)
    harness.close()
  })

  it('loads GitHub once for two Resolutions of one commit in one Queue batch', async () => {
    const harness = await createReuseHarness()
    const first = await harness.request(pinned)
    const second = await harness.request(onBranch)
    const github = githubServing(source)

    await consumeArtifactBuildBatch({} as Cloudflare.Env, queueBatch([first, second], 1), () => harness.dependencies(github))

    const rows = await Promise.all([first, second].map(id => getResolution(harness.db, id)))
    expect(rows.map(row => row?.state)).toEqual(['ready', 'ready'])
    expect(rows[1]?.artifact_id).toBe(rows[0]?.artifact_id)
    expect(github.load).toHaveBeenCalledOnce()
    harness.close()
  })

  it('never gives a private Resolution a public build', async () => {
    const harness = await createReuseHarness()
    await harness.build(pinned, githubServing(source))
    const privateSource = { ...source, visibility: 'private' as const }
    const github = githubServing(privateSource)
    harness.raw.prepare(
      `INSERT INTO users (id, github_id, login, digest_frequency, digest_hour, timezone, created_at, last_login_at)
       VALUES (1, 101, 'skilld-dev', 'weekly', 9, 'UTC', ?, ?)`,
    ).run(NOW, NOW)
    const resolutionId = await harness.request(pinned, {
      visibility: 'private',
      accountId: 1,
      installationId: 9001,
      repositoryId: source.repositoryId,
    })
    const dependencies: ArtifactBuildDependencies = {
      ...harness.dependencies(githubDown()),
      privateGithub: async () => github,
      privateArtifacts: {
        put: vi.fn(async () => ({
          _tag: 'stored' as const,
          key: `v1/private/account/${resolutionId}.bin`,
          ciphertextSha256: 'f'.repeat(64),
          ciphertextBytes: 1024,
          encryptionKeyId: 'account-fixture',
        })),
      },
      signer: { sign: vi.fn(async () => Promise.reject(new Error('Private signing is out of scope here'))) },
    }

    await expect(processArtifactBuild(dependencies, resolutionId)).rejects.toThrow('Private signing is out of scope here')

    expect(github.resolve).toHaveBeenCalledOnce()
    expect(github.load).toHaveBeenCalledOnce()
    expect(harness.reports.filter(report => report.resolutionId === resolutionId)).toEqual([])
    harness.close()
  })
})

type ReuseHarness = Awaited<ReturnType<typeof createReuseHarness>>

async function createReuseHarness() {
  const sqlite = createSqliteD1(MIGRATIONS)
  const storage = memoryBucket()
  const reports: ArtifactBuildReuseReport[] = []
  let clock = NOW
  let requests = 0
  let signing = await signingKey('skilld-production-2026-08')
  const signerBindings: ArtifactSignerBindings = {
    DB: sqlite.db,
    PUBLIC_ARTIFACTS: storage.bucket,
    PRIVATE_ARTIFACTS: storage.bucket,
    ARTIFACT_SIGNING_MAX_AGE_SECONDS: '300',
    ...signing.bindings,
  }
  const signer = createArtifactSigner({
    fetch: async (request: Request) => await handleArtifactSignerRequest(request, signerBindings, () => clock),
  } as unknown as Fetcher)

  function dependencies(github: PublicGithubSourceClient): ArtifactBuildDependencies {
    return {
      db: sqlite.db,
      github,
      bucket: storage.bucket,
      signer,
      trustedRoot: signing.trustedRoot,
      now: () => clock,
      reportReuse: report => reports.push(report),
    }
  }

  async function request(
    sourceRequest: SourceRequest,
    access?: Parameters<typeof createResolution>[4],
  ): Promise<string> {
    requests += 1
    const accountId = access?.visibility === 'private' ? access.accountId : undefined
    const identity = await resolutionRequestIdentity(sourceRequest, `reuse-test-request-${requests}`, accountId)
    const created = await createResolution(sqlite.db, sourceRequest, identity, clock, access)
    if (created._tag === 'idempotency-conflict')
      throw new Error('Test Resolution conflicted')
    return created.row.id
  }

  async function build(sourceRequest: SourceRequest, github: PublicGithubSourceClient) {
    const resolutionId = await request(sourceRequest)
    const outcome = await processArtifactBuild(dependencies(github), resolutionId)
    const row = await getResolution(sqlite.db, resolutionId)
    if (!row)
      throw new Error('Test Resolution was not stored')
    return { outcome, row }
  }

  /** Replace a ready build's attestation with a changed statement the current key signs. */
  async function resignReadyBuild(
    resolutionId: string,
    edit: (statement: ArtifactAttestationStatement) => ArtifactAttestationStatement,
  ): Promise<void> {
    const row = await getResolution(sqlite.db, resolutionId)
    if (!row)
      throw new Error('Test Resolution was not stored')
    const { statement: _statement, signature: _signature, ...statement } = parseReady(row)
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
    sqlite.raw.prepare('UPDATE artifact_resolutions SET attestation_json = ? WHERE id = ?')
      .run(JSON.stringify(attestation), resolutionId)
  }

  /** The signer moves to a new key, and the trusted root drops the old one. */
  async function rotateSigningKey(): Promise<void> {
    signing = await signingKey('skilld-production-2026-11')
    Object.assign(signerBindings, signing.bindings)
  }

  return {
    db: sqlite.db,
    raw: sqlite.raw,
    storage,
    reports,
    now: () => clock,
    advanceClock: (seconds: number) => {
      clock += seconds
    },
    trustedRoot: () => signing.trustedRoot,
    dependencies,
    request,
    build,
    resignReadyBuild,
    rotateSigningKey,
    close: sqlite.close,
  }
}

function githubServing(resolved: ResolvedSource) {
  return {
    resolve: vi.fn(async () => ({ _tag: 'resolved' as const, source: resolved })),
    load: vi.fn(async () => ({ _tag: 'loaded' as const, value: { source: resolved, files } })),
  } satisfies PublicGithubSourceClient
}

/** GitHub as it behaved on 2026-09-30: every read hangs until its timeout. */
function githubDown() {
  const fault = async () => Promise.reject(new Error('The operation was aborted due to timeout'))
  return { resolve: vi.fn(fault), load: vi.fn(fault) } satisfies PublicGithubSourceClient
}

function parseReady(row: ResolutionRow) {
  return artifactAttestationSchema.parse(JSON.parse(row.attestation_json ?? 'null'))
}

function queueBatch(resolutionIds: string[], attempts: number) {
  return {
    queue: ARTIFACT_BUILD_QUEUE_NAME,
    messages: resolutionIds.map(resolutionId => ({
      body: { version: 1, resolutionId },
      attempts,
      ack: vi.fn(),
      retry: vi.fn(),
    })),
  } as unknown as Parameters<typeof consumeArtifactBuildBatch>[1]
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

/** An R2 bucket in memory that computes checksums from the bytes, as R2 does. */
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
  const put = vi.fn(async (key: string, value: Uint8Array, options?: R2PutOptions) => {
    if (objects.has(key))
      return null
    objects.set(key, { bytes: Uint8Array.from(value), customMetadata: options?.customMetadata ?? {} })
    return describeObject(key)
  })
  const bucket = {
    put,
    head: async (key: string) => describeObject(key),
    get: async (key: string) => {
      const object = describeObject(key)
      const stored = objects.get(key)
      return object && stored
        ? { ...object, arrayBuffer: async () => Uint8Array.from(stored.bytes).buffer }
        : null
    },
  } as unknown as R2Bucket
  return {
    bucket,
    put,
    remove: (key: string) => objects.delete(key),
  }
}

describe('round trips to D1 for one build', () => {
  // The queue consumer runs far from the D1 primary: each round trip cost
  // about 170 ms in production traces on 2026-10-07, so the count is latency.
  it('a fresh build reaches ready in 14 round trips', async () => {
    const harness = await createReuseHarness()
    const resolutionId = await harness.request(pinned)
    const counted = countRoundTrips(harness.db)

    const outcome = await processArtifactBuild({ ...harness.dependencies(githubServing(source)), db: counted.db }, resolutionId)

    expect(outcome._tag).toBe('ready')
    expect(counted.roundTrips()).toBe(14)
    harness.close()
  })

  it('a reused build reaches ready in 11 round trips', async () => {
    const harness = await createReuseHarness()
    await harness.build(pinned, githubServing(source))
    const resolutionId = await harness.request(pinned)
    const counted = countRoundTrips(harness.db)

    const outcome = await processArtifactBuild({ ...harness.dependencies(githubDown()), db: counted.db }, resolutionId)

    expect(outcome._tag).toBe('ready')
    expect(counted.roundTrips()).toBe(11)
    harness.close()
  })
})

describe('round trips to D1 for one Resolution request', () => {
  it('a new request key stores its Resolution in one round trip', async () => {
    const harness = await createReuseHarness()
    const counted = countRoundTrips(harness.db)
    const identity = await resolutionRequestIdentity(pinned, 'round-trip-request-key')

    const created = await createResolution(counted.db, pinned, identity, harness.now())

    expect(created._tag).toBe('created')
    expect(counted.roundTrips()).toBe(1)
    harness.close()
  })

  it('a replayed request key answers its first Resolution', async () => {
    const harness = await createReuseHarness()
    const identity = await resolutionRequestIdentity(pinned, 'round-trip-request-key')
    const first = await createResolution(harness.db, pinned, identity, harness.now())
    const counted = countRoundTrips(harness.db)

    const replay = await createResolution(counted.db, pinned, identity, harness.now())

    expect(replay).toEqual({ _tag: 'existing', row: first._tag === 'created' ? first.row : undefined })
    expect(counted.roundTrips()).toBe(2)
    harness.close()
  })
})

describe('round trips to D1 for one grant', () => {
  it('a grant for a named Resolution reads D1 once', async () => {
    const harness = await createReuseHarness()
    const built = await harness.build(pinned, githubServing(source))
    const counted = countRoundTrips(harness.db)

    const grant = await createPublicArtifactGrant({
      db: counted.db,
      trustedRoot: harness.trustedRoot(),
      publicBaseUrl: 'https://artifacts.skilld.dev',
      now: harness.now(),
    }, built.row.artifact_id!, built.row.id)

    expect(grant._tag).toBe('granted')
    expect(counted.roundTrips()).toBe(1)
    harness.close()
  })

  it('a grant without a named Resolution still checks the newest one', async () => {
    const harness = await createReuseHarness()
    const built = await harness.build(pinned, githubServing(source))
    const counted = countRoundTrips(harness.db)

    const grant = await createPublicArtifactGrant({
      db: counted.db,
      trustedRoot: harness.trustedRoot(),
      publicBaseUrl: 'https://artifacts.skilld.dev',
      now: harness.now(),
    }, built.row.artifact_id!)

    expect(grant._tag).toBe('granted')
    expect(counted.roundTrips()).toBe(2)
    harness.close()
  })

  it('a grant for a named Resolution that blocks delivery is denied', async () => {
    const harness = await createReuseHarness()
    const built = await harness.build(pinned, githubServing(source))
    harness.raw.prepare(`UPDATE artifact_check_results SET outcome = 'fail', required = 1 WHERE resolution_id = ?`).run(built.row.id)

    const grant = await createPublicArtifactGrant({
      db: harness.db,
      trustedRoot: harness.trustedRoot(),
      publicBaseUrl: 'https://artifacts.skilld.dev',
      now: harness.now(),
    }, built.row.artifact_id!, built.row.id)

    expect(grant).toEqual({ _tag: 'denied', code: 'CHECK_BLOCKED' })
    harness.close()
  })
})

/** Counts D1 network round trips: one per statement call, one per batch. */
function countRoundTrips(db: D1Database) {
  let count = 0
  const wrap = (statement: D1PreparedStatement): D1PreparedStatement => new Proxy(statement, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (property === 'bind')
        return (...values: unknown[]) => wrap(target.bind(...values))
      if (property === 'first' || property === 'all' || property === 'run' || property === 'raw') {
        return (...args: unknown[]) => {
          count += 1
          return (value as (...inner: unknown[]) => unknown).apply(target, args)
        }
      }
      return value
    },
  })
  const counted = new Proxy(db, {
    get(target, property, receiver) {
      if (property === 'prepare')
        return (sql: string) => wrap(target.prepare(sql))
      if (property === 'batch') {
        return async (statements: D1PreparedStatement[]) => {
          count += 1
          return await target.batch(statements)
        }
      }
      return Reflect.get(target, property, receiver)
    },
  })
  return { db: counted, roundTrips: () => count }
}
