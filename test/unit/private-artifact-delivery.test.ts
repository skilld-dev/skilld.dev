import { describe, expect, it } from 'vitest'
import { bytesToBase64Url, digestHex } from '../../layers/artifact-delivery/server/utils/encoding'
import {
  canReadPrivateResolution,
  connectGithubInstallation,
  findPrivateRepositoryAccess,
  processGithubAppWebhook,
} from '../../layers/artifact-delivery/server/utils/private-access'
import {
  createD1PrivateArtifactKeyProvider,
  decryptPrivateArtifact,
  encryptPrivateArtifact,
} from '../../layers/artifact-delivery/server/utils/private-crypto'
import {
  createPrivateArtifactGrant,
  redeemPrivateArtifactGrant,
} from '../../layers/artifact-delivery/server/utils/private-grant'
import { createSqliteD1 } from './helpers/d1-sqlite'

const NOW = 1_787_227_200
const ACCOUNT_ONE = 1
const ACCOUNT_TWO = 2
const INSTALLATION_ID = 9001
const REPOSITORY_ID = 7001
const RESOLUTION_ID = '018f3e3e-10d8-7f41-8d5c-10d2a8f92311'
const ARTIFACT_BYTES = new TextEncoder().encode('private Artifact bytes')

describe('private Artifact delivery', () => {
  it('connects every selected Repository within the documented limit', async () => {
    const fixture = await createFixture()
    const repositories = Array.from({ length: 500 }, (_, index) => ({
      id: REPOSITORY_ID + index,
      name: `private-skills-${index}`,
      private: true as const,
      owner: { id: 501, login: 'acme' },
    }))

    const result = await connectGithubInstallation(fixture.db, ACCOUNT_ONE, {
      installationId: INSTALLATION_ID,
      githubAccountId: 501,
      repositories,
    }, NOW + 1)

    expect(result).toEqual({
      _tag: 'connected',
      installationId: INSTALLATION_ID,
      repositoryCount: repositories.length,
      state: 'active',
    })
    expect(await findPrivateRepositoryAccess(fixture.db, ACCOUNT_ONE, 'acme', 'private-skills-499'))
      .toMatchObject({ _tag: 'allowed', repositoryId: REPOSITORY_ID + 499 })
    fixture.close()
  })

  it('requires the Account installation and selected Repository mapping', async () => {
    const fixture = await createFixture()

    expect(await findPrivateRepositoryAccess(fixture.db, ACCOUNT_ONE, 'acme', 'private-skills'))
      .toMatchObject({ _tag: 'allowed', repositoryId: REPOSITORY_ID })
    expect(await findPrivateRepositoryAccess(fixture.db, ACCOUNT_TWO, 'acme', 'private-skills'))
      .toEqual({ _tag: 'not-found' })
    expect(await findPrivateRepositoryAccess(fixture.db, ACCOUNT_ONE, 'acme', 'another'))
      .toEqual({ _tag: 'not-found' })
    fixture.close()
  })

  it('does not transfer one installation between concurrent Accounts', async () => {
    const fixture = await createFixture()
    fixture.raw.exec('DELETE FROM github_app_repositories; DELETE FROM github_app_installations;')
    const connection = {
      installationId: INSTALLATION_ID,
      githubAccountId: 501,
      repositories: [{
        id: REPOSITORY_ID,
        name: 'private-skills',
        private: true as const,
        owner: { id: 501, login: 'acme' },
      }],
    }

    const results = await Promise.all([
      connectGithubInstallation(fixture.db, ACCOUNT_ONE, connection, NOW),
      connectGithubInstallation(fixture.db, ACCOUNT_TWO, connection, NOW),
    ])

    expect(results.map(result => result._tag).sort()).toEqual(['connected', 'not-found'])
    fixture.close()
  })

  it('encrypts with an Account key and rejects changed ciphertext', async () => {
    const fixture = await createFixture()
    const encrypted = await encryptPrivateArtifact(fixture.keys, {
      accountId: ACCOUNT_ONE,
      artifactId: fixture.artifactId,
      resolutionId: RESOLUTION_ID,
      bytes: ARTIFACT_BYTES,
    })
    const decrypted = await decryptPrivateArtifact(fixture.keys, {
      accountId: ACCOUNT_ONE,
      artifactId: fixture.artifactId,
      resolutionId: RESOLUTION_ID,
      ciphertext: encrypted.ciphertext,
      contentSha256: fixture.contentSha256,
      contentBytes: ARTIFACT_BYTES.byteLength,
      keyId: encrypted.keyId,
    })
    const changed = Uint8Array.from(encrypted.ciphertext)
    changed[changed.length - 1] ^= 1

    expect(decrypted).toEqual({ _tag: 'decrypted', bytes: ARTIFACT_BYTES })
    expect(await decryptPrivateArtifact(fixture.keys, {
      accountId: ACCOUNT_ONE,
      artifactId: fixture.artifactId,
      resolutionId: RESOLUTION_ID,
      ciphertext: changed,
      contentSha256: fixture.contentSha256,
      contentBytes: ARTIFACT_BYTES.byteLength,
      keyId: encrypted.keyId,
    })).toEqual({ _tag: 'rejected' })
    fixture.close()
  })

  it('rewraps Account keys without making old private Artifacts unreadable', async () => {
    const fixture = await createFixture()
    const oldMasterKey = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)))
    const newMasterKey = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)))
    const oldKeys = createD1PrivateArtifactKeyProvider(fixture.db, {
      active: { id: 'wrap-1', key: oldMasterKey },
    }, () => NOW)
    const encrypted = await encryptPrivateArtifact(oldKeys, {
      accountId: ACCOUNT_ONE,
      artifactId: fixture.artifactId,
      resolutionId: RESOLUTION_ID,
      bytes: ARTIFACT_BYTES,
    })
    const rotatedKeys = createD1PrivateArtifactKeyProvider(fixture.db, {
      active: { id: 'wrap-2', key: newMasterKey },
      previous: { id: 'wrap-1', key: oldMasterKey },
    }, () => NOW + 1)

    const decrypted = await decryptPrivateArtifact(rotatedKeys, {
      accountId: ACCOUNT_ONE,
      artifactId: fixture.artifactId,
      resolutionId: RESOLUTION_ID,
      ciphertext: encrypted.ciphertext,
      contentSha256: fixture.contentSha256,
      contentBytes: ARTIFACT_BYTES.byteLength,
      keyId: encrypted.keyId,
    })

    expect(decrypted).toEqual({ _tag: 'decrypted', bytes: ARTIFACT_BYTES })
    expect(fixture.raw.prepare(
      'SELECT wrap_key_id FROM private_artifact_keys WHERE account_id = ?',
    ).get(ACCOUNT_ONE)).toEqual({ wrap_key_id: 'wrap-2' })
    fixture.close()
  })

  it('denies cross-Account grants with the same result as a missing Artifact', async () => {
    const fixture = await createReadyFixture()

    const wrongAccount = await createPrivateArtifactGrant(fixture.grantDependencies, ACCOUNT_TWO, fixture.artifactId, grantKey('wrong'))
    const missing = await createPrivateArtifactGrant(fixture.grantDependencies, ACCOUNT_TWO, `sha256:${'f'.repeat(64)}`, grantKey('missing'))

    expect(wrongAccount).toEqual({ _tag: 'not-found' })
    expect(missing).toEqual(wrongAccount)
    fixture.close()
  })

  it('does not substitute a private Resolution when the requested Resolution is missing', async () => {
    const fixture = await createReadyFixture()
    const result = await createPrivateArtifactGrant(
      fixture.grantDependencies,
      ACCOUNT_ONE,
      fixture.artifactId,
      grantKey('missing-resolution'),
      crypto.randomUUID(),
    )
    expect(result).toEqual({ _tag: 'not-found' })
    fixture.close()
  })

  it('accepts one download within 60 seconds, then denies replay', async () => {
    const fixture = await createReadyFixture()
    const grant = await createPrivateArtifactGrant(fixture.grantDependencies, ACCOUNT_ONE, fixture.artifactId, grantKey('download'))
    if (grant._tag !== 'granted')
      throw new Error('Fixture did not create a grant')

    const first = await redeemPrivateArtifactGrant(fixture.contentDependencies, ACCOUNT_ONE, fixture.artifactId, grant.grant.downloadToken)
    const replay = await redeemPrivateArtifactGrant(fixture.contentDependencies, ACCOUNT_ONE, fixture.artifactId, grant.grant.downloadToken)

    expect(first).toEqual({ _tag: 'content', bytes: ARTIFACT_BYTES })
    expect(replay).toEqual({ _tag: 'not-found' })
    expect(Date.parse(grant.grant.expiresAt) / 1000).toBe(NOW + 60)
    fixture.close()
  })

  it('returns one private grant for an idempotent retry', async () => {
    const fixture = await createReadyFixture()
    const key = grantKey('retry')

    const first = await createPrivateArtifactGrant(fixture.grantDependencies, ACCOUNT_ONE, fixture.artifactId, key)
    const second = await createPrivateArtifactGrant(fixture.grantDependencies, ACCOUNT_ONE, fixture.artifactId, key)

    expect(second).toEqual(first)
    expect(fixture.raw.prepare(
      'SELECT COUNT(*) AS count FROM artifact_download_grants',
    ).get()).toEqual({ count: 1 })
    fixture.close()
  })

  it('denies expired grants before it reads R2', async () => {
    const fixture = await createReadyFixture()
    const grant = await createPrivateArtifactGrant(fixture.grantDependencies, ACCOUNT_ONE, fixture.artifactId, grantKey('expiry'))
    if (grant._tag !== 'granted')
      throw new Error('Fixture did not create a grant')
    fixture.contentDependencies.now = NOW + 61

    expect(await redeemPrivateArtifactGrant(
      fixture.contentDependencies,
      ACCOUNT_ONE,
      fixture.artifactId,
      grant.grant.downloadToken,
    )).toEqual({ _tag: 'not-found' })
    expect(fixture.bucketReads()).toBe(0)
    fixture.close()
  })

  it('blocks grants and downloads after a Repository removal webhook', async () => {
    const fixture = await createReadyFixture()
    const grant = await createPrivateArtifactGrant(fixture.grantDependencies, ACCOUNT_ONE, fixture.artifactId, grantKey('revocation'))
    if (grant._tag !== 'granted')
      throw new Error('Fixture did not create a grant')

    await processGithubAppWebhook(fixture.db, {
      deliveryId: 'delivery-1',
      event: 'installation_repositories',
      payload: {
        action: 'removed',
        installation: { id: INSTALLATION_ID },
        repositories_removed: [{ id: REPOSITORY_ID }],
      },
      now: NOW + 1,
    })

    expect(await createPrivateArtifactGrant(fixture.grantDependencies, ACCOUNT_ONE, fixture.artifactId, grantKey('after-revocation')))
      .toEqual({ _tag: 'not-found' })
    expect(await redeemPrivateArtifactGrant(
      fixture.contentDependencies,
      ACCOUNT_ONE,
      fixture.artifactId,
      grant.grant.downloadToken,
    )).toEqual({ _tag: 'not-found' })
    fixture.close()
  })

  it('revokes 500 removed Repositories within one D1 invocation budget', async () => {
    const fixture = await createFixture({ maximumQueries: 1000 })
    const repositories = Array.from({ length: 500 }, (_, index) => ({
      id: REPOSITORY_ID + index,
      name: `private-skills-${index}`,
      private: true as const,
      owner: { id: 501, login: 'acme' },
    }))
    await connectGithubInstallation(fixture.db, ACCOUNT_ONE, {
      installationId: INSTALLATION_ID,
      githubAccountId: 501,
      repositories,
    }, NOW)

    const result = await processGithubAppWebhook(fixture.db, {
      deliveryId: 'delivery-remove-500',
      event: 'installation_repositories',
      payload: {
        action: 'removed',
        installation: { id: INSTALLATION_ID },
        repositories_removed: repositories.map(repository => ({ id: repository.id })),
      },
      now: NOW + 1,
    })

    expect(result).toEqual({ _tag: 'processed' })
    expect(await findPrivateRepositoryAccess(
      fixture.db,
      ACCOUNT_ONE,
      'acme',
      'private-skills-499',
    )).toEqual({ _tag: 'not-found' })
    fixture.close()
  })

  it('rechecks live GitHub access before exposing private Resolution metadata', async () => {
    const fixture = await createReadyFixture()

    expect(await canReadPrivateResolution(
      fixture.db,
      ACCOUNT_ONE,
      RESOLUTION_ID,
      async () => false,
    )).toBe(false)
    fixture.close()
  })

  it('retries revocation when the first webhook transaction fails', async () => {
    const fixture = await createFixture()
    let failNextBatch = true
    let failCleanup = true
    const flakyDb = {
      prepare: (sql: string) => {
        const prepared = fixture.db.prepare(sql)
        if (!sql.startsWith('DELETE FROM github_app_webhook_deliveries'))
          return prepared
        return {
          bind: (...values: unknown[]) => {
            const bound = prepared.bind(...values)
            return {
              ...bound,
              run: async () => {
                if (failCleanup) {
                  failCleanup = false
                  throw new Error('D1 cleanup unavailable')
                }
                return await bound.run()
              },
            }
          },
        } as unknown as D1PreparedStatement
      },
      batch: async (statements: D1PreparedStatement[]) => {
        if (failNextBatch) {
          failNextBatch = false
          throw new Error('D1 batch unavailable')
        }
        return await fixture.db.batch(statements)
      },
    } as unknown as D1Database
    const webhook = {
      deliveryId: 'delivery-retry',
      event: 'installation_repositories',
      payload: {
        action: 'removed',
        installation: { id: INSTALLATION_ID },
        repositories_removed: [{ id: REPOSITORY_ID }],
      },
      now: NOW + 1,
    }

    await expect(processGithubAppWebhook(flakyDb, webhook)).rejects.toThrow('D1 cleanup unavailable')
    const retry = await processGithubAppWebhook(flakyDb, webhook)

    expect(retry).toEqual({ _tag: 'processed' })
    expect(await findPrivateRepositoryAccess(fixture.db, ACCOUNT_ONE, 'acme', 'private-skills'))
      .toEqual({ _tag: 'not-found' })
    fixture.close()
  })

  it('rejects ciphertext metadata or bytes that change in R2', async () => {
    const fixture = await createReadyFixture({ mutateCiphertext: true })
    const grant = await createPrivateArtifactGrant(fixture.grantDependencies, ACCOUNT_ONE, fixture.artifactId, grantKey('ciphertext'))
    if (grant._tag !== 'granted')
      throw new Error('Fixture did not create a grant')

    expect(await redeemPrivateArtifactGrant(
      fixture.contentDependencies,
      ACCOUNT_ONE,
      fixture.artifactId,
      grant.grant.downloadToken,
    )).toEqual({ _tag: 'rejected', code: 'ARTIFACT_REVOKED' })
    fixture.close()
  })
})

async function createFixture(options: { maximumQueries?: number } = {}) {
  const sqlite = createSqliteD1([
    'migrations/0017_users.sql',
    'migrations/0110_artifact_delivery.sql',
    'migrations/0111_github_app_delivery.sql',
    'migrations/0112_private_artifact_keys.sql',
  ], options)
  insertUser(sqlite.raw, ACCOUNT_ONE, 101, 'one')
  insertUser(sqlite.raw, ACCOUNT_TWO, 102, 'two')
  sqlite.raw.prepare(
    `INSERT INTO github_app_installations
       (installation_id, account_id, github_account_id, state, connected_at, verified_at)
     VALUES (?, ?, ?, 'active', ?, ?)`,
  ).run(INSTALLATION_ID, ACCOUNT_ONE, 501, NOW, NOW)
  sqlite.raw.prepare(
    `INSERT INTO github_app_repositories
       (installation_id, repository_id, owner, repository, visibility, state, selected_at)
     VALUES (?, ?, 'acme', 'private-skills', 'private', 'selected', ?)`,
  ).run(INSTALLATION_ID, REPOSITORY_ID, NOW)
  const masterKey = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)))
  const keys = createD1PrivateArtifactKeyProvider(sqlite.db, {
    active: { id: 'wrap-fixture', key: masterKey },
  }, () => NOW)
  const contentSha256 = await digestHex('SHA-256', ARTIFACT_BYTES)
  return {
    db: sqlite.db,
    raw: sqlite.raw,
    close: sqlite.close,
    keys,
    contentSha256,
    artifactId: `sha256:${contentSha256}`,
  }
}

async function createReadyFixture(options: { mutateCiphertext?: boolean } = {}) {
  const fixture = await createFixture()
  const encrypted = await encryptPrivateArtifact(fixture.keys, {
    accountId: ACCOUNT_ONE,
    artifactId: fixture.artifactId,
    resolutionId: RESOLUTION_ID,
    bytes: ARTIFACT_BYTES,
  })
  const r2Key = `v1/private/account/${RESOLUTION_ID}.bin`
  fixture.raw.prepare(
    `INSERT INTO artifact_resolutions (
       id, request_fingerprint, state, state_version,
       requested_owner, requested_repository, selector_type, selector_value,
       repository_id, resolved_owner, resolved_repository, commit_sha, tree_sha,
       skill_path, artifact_id, content_sha256, content_bytes, r2_key,
       check_results_json, attestation_json, created_at, updated_at,
       visibility, account_id, github_installation_id,
       ciphertext_sha256, ciphertext_bytes, encryption_key_id
     ) VALUES (?, 'fixture', 'ready', 8, 'acme', 'private-skills', 'path', 'skills/demo',
       ?, 'acme', 'private-skills', ?, ?, 'skills/demo', ?, ?, ?, ?, ?, '{}', ?, ?,
       'private', ?, ?, ?, ?, ?)`,
  ).run(
    RESOLUTION_ID,
    REPOSITORY_ID,
    '0'.repeat(40),
    '1'.repeat(40),
    fixture.artifactId,
    fixture.contentSha256,
    ARTIFACT_BYTES.byteLength,
    r2Key,
    JSON.stringify(requiredChecks()),
    NOW,
    NOW,
    ACCOUNT_ONE,
    INSTALLATION_ID,
    encrypted.ciphertextSha256,
    encrypted.ciphertext.byteLength,
    encrypted.keyId,
  )
  fixture.raw.prepare(
    `INSERT INTO private_artifacts (
       account_id, artifact_id, resolution_id, repository_id,
       content_sha256, content_bytes, ciphertext_sha256, ciphertext_bytes,
       r2_key, encryption_key_id, delivery_status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', ?, ?)`,
  ).run(
    ACCOUNT_ONE,
    fixture.artifactId,
    RESOLUTION_ID,
    REPOSITORY_ID,
    fixture.contentSha256,
    ARTIFACT_BYTES.byteLength,
    encrypted.ciphertextSha256,
    encrypted.ciphertext.byteLength,
    r2Key,
    encrypted.keyId,
    NOW,
    NOW,
  )
  const body = Uint8Array.from(encrypted.ciphertext)
  if (options.mutateCiphertext)
    body[body.length - 1] ^= 1
  let reads = 0
  const bucket = {
    get: async () => {
      reads++
      return {
        size: body.byteLength,
        customMetadata: {
          accountIdHash: await digestHex('SHA-256', String(ACCOUNT_ONE)),
          artifactId: fixture.artifactId,
          ciphertextSha256: encrypted.ciphertextSha256,
          contentSha256: fixture.contentSha256,
          encryptionKeyId: encrypted.keyId,
          format: 'skilld-private-artifact-v1',
          resolutionId: RESOLUTION_ID,
        },
        arrayBuffer: async () => body.buffer,
      } as R2ObjectBody
    },
  } as R2Bucket
  const attestation = {
    version: 1 as const,
    artifactId: fixture.artifactId,
    createdAt: new Date(NOW * 1000).toISOString(),
    source: {
      provider: 'github' as const,
      repositoryId: REPOSITORY_ID,
      owner: 'acme',
      repository: 'private-skills',
      visibility: 'private' as const,
      commitSha: '0'.repeat(40),
      treeSha: '1'.repeat(40),
      skillPath: 'skills/demo',
    },
    sourceStatus: 'verified' as const,
    format: 'skilld-tar-v1' as const,
    contentSha256: fixture.contentSha256,
    contentBytes: ARTIFACT_BYTES.byteLength,
    policyVersion: 'fixture',
    files: [{ path: 'SKILL.md', mode: 420 as const, size: 1, sha256: '2'.repeat(64) }],
    checkResults: requiredChecks(),
    statement: 'e30',
    signature: { algorithm: 'Ed25519' as const, keyId: 'fixture', value: 'A'.repeat(86) },
  }
  fixture.raw.prepare(
    `INSERT INTO private_artifact_attestations
       (resolution_id, account_id, artifact_id, attestation_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(RESOLUTION_ID, ACCOUNT_ONE, fixture.artifactId, JSON.stringify(attestation), NOW)
  for (const check of requiredChecks()) {
    fixture.raw.prepare(
      `INSERT INTO artifact_check_results
       (resolution_id, name, version, outcome, required, findings_json, checked_at)
       VALUES (?, ?, ?, ?, ?, '[]', ?)`,
    ).run(RESOLUTION_ID, check.name, check.version, check.outcome, Number(check.required), NOW)
  }
  return {
    ...fixture,
    grantDependencies: {
      db: fixture.db,
      now: NOW,
      contentBaseUrl: 'https://skilld.dev',
      verifyAttestation: async () => true,
      recheckAccess: async () => true,
      idempotencySecret: bytesToBase64Url(new Uint8Array(32).fill(7)),
    },
    contentDependencies: {
      db: fixture.db,
      bucket,
      keys: fixture.keys,
      now: NOW,
    },
    bucketReads: () => reads,
  }
}

function grantKey(label: string): string {
  return `private-grant-${label}-idempotency-key`
}

function insertUser(db: import('better-sqlite3').Database, id: number, githubId: number, login: string) {
  db.prepare(
    `INSERT INTO users (
       id, github_id, login, digest_frequency, digest_hour, timezone,
       created_at, last_login_at
     ) VALUES (?, ?, ?, 'weekly', 9, 'UTC', ?, ?)`,
  ).run(id, githubId, login, NOW, NOW)
}

function requiredChecks() {
  return [
    { name: 'path-policy', version: '1', outcome: 'pass' as const, required: true },
    { name: 'agent-skills-spec', version: '2026-10-07', outcome: 'pass' as const, required: false },
    { name: 'credential-material', version: '2', outcome: 'pass' as const, required: true },
    { name: 'executable-files', version: '1', outcome: 'pass' as const, required: false },
    { name: 'omitted-files', version: '1', outcome: 'pass' as const, required: false },
  ]
}
