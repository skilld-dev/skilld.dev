import type { TrustedRootConfig } from '../../scripts/lib/trusted-root-ceremony'
import { generateKeyPairSync } from 'node:crypto'
import { createApp, createError, createRouter, defineEventHandler, toWebHandler } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bytesToBase64Url } from '../../layers/artifact-delivery/server/utils/encoding'
import { parseTrustedRoot, parseTrustedRoots, siteTrustedRoot } from '../../layers/artifact-delivery/server/utils/trusted-root'
import { createTrustedRoot, generateSigningKey } from '../../scripts/lib/trusted-root-ceremony'

vi.mock('../../shared/server/session-access', () => ({ readUserSession: async () => null }))
vi.mock('../../layers/identity/server/utils/bearer', () => ({ resolveBearerSession: async () => null }))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const statement = {
  version: 1,
  rootKeyId: 'skilld-root-2026',
  keyId: 'skilld-production-2026-03',
  algorithm: 'Ed25519',
  publicKey: 'B'.repeat(43),
  notBefore: '2026-07-01T00:00:00.000Z',
  notAfter: '2026-10-01T00:00:00.000Z',
  status: 'active',
} as const

function trustedRoot(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    version: 1,
    rootKeyId: statement.rootKeyId,
    rootPublicKey: 'A'.repeat(43),
    keys: [{
      keyId: statement.keyId,
      algorithm: statement.algorithm,
      publicKey: statement.publicKey,
      notBefore: statement.notBefore,
      notAfter: statement.notAfter,
      status: statement.status,
      statement: bytesToBase64Url(new TextEncoder().encode(JSON.stringify(statement))),
      rootSignature: 'C'.repeat(86),
      ...overrides,
    }],
  })
}

describe('trusted root parsing', () => {
  it('preserves exact root-signed statement bytes', () => {
    const parsed = parseTrustedRoot(trustedRoot(), 1_776_297_600)

    expect(parsed.keys[0]?.statement).toBe(bytesToBase64Url(new TextEncoder().encode(JSON.stringify(statement))))
  })

  it('rejects fields that differ from the signed statement', () => {
    expect(() => parseTrustedRoot(trustedRoot({ status: 'revoked' }), 1_776_297_600))
      .toThrow('statement does not match its fields')
  })

  it('rejects non-canonical statement encoding', () => {
    const encoded = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(statement)))
    expect(() => parseTrustedRoot(trustedRoot({ statement: `${encoded}=` }), 1_776_297_600)).toThrow()
  })
})

// skilld CLI 3.7.0 and later fetch their pinned root by id, because the key for
// `skilld-root-2026` was lost and older CLIs can only ever read that root.
describe('trusted roots by id', () => {
  const now = Date.parse('2026-11-18T12:00:00.000Z') / 1000

  function root(rootKeyId: string): TrustedRootConfig {
    const { privateKey } = generateKeyPairSync('ed25519')
    return createTrustedRoot(rootKeyId, privateKey, {
      keyId: 'skilld-production-2026-11',
      publicKey: generateSigningKey().publicKey,
      notBefore: '2026-11-18T00:00:00.000Z',
      notAfter: '2027-05-20T00:00:00.000Z',
      status: 'active',
    })
  }

  it.each([0, 1])('serves a healthy endpoint when root at index %i is malformed', async (invalidIndex) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('defineEventHandler', defineEventHandler)
    vi.stubGlobal('createError', createError)
    const { default: handler } = await import('../../layers/artifact-delivery/server/api/v1/trusted-roots/[rootKeyId].get')
    const configs = [root('primary'), root('backup')]
    configs[invalidIndex] = { ...configs[invalidIndex]!, keys: [] }
    const healthy = configs[1 - invalidIndex]!
    const app = createApp().use(defineEventHandler((event) => {
      event.context.platform = { env: { ARTIFACT_TRUSTED_ROOTS_JSON: JSON.stringify(configs) } } as never
    }))
    app.use(createRouter().get('/api/v1/trusted-roots/:rootKeyId', handler))
    const response = await toWebHandler(app)(new Request(`http://localhost/api/v1/trusted-roots/${healthy.rootKeyId}`))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject(healthy)
  })

  it('reads every served root with its root key id', () => {
    const roots = parseTrustedRoots(JSON.stringify([root('skilld-root-2026-11'), root('skilld-root-backup-2026-11')]), now)

    expect(roots.map(served => served.rootKeyId)).toEqual(['skilld-root-2026-11', 'skilld-root-backup-2026-11'])
  })

  it('serves and selects the primary when a malformed backup repeats its ID', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('defineEventHandler', defineEventHandler)
    vi.stubGlobal('createError', createError)
    const { default: handler } = await import('../../layers/artifact-delivery/server/api/v1/trusted-roots/[rootKeyId].get')
    const primary = root('primary')
    const env = {
      ARTIFACT_TRUSTED_ROOTS_JSON: JSON.stringify([primary, { ...primary, keys: [] }]),
      ARTIFACT_TRUSTED_ROOT_JSON: trustedRoot(),
    }
    const app = createApp().use(defineEventHandler((event) => {
      event.context.platform = { env } as never
    }))
    app.use(createRouter().get('/api/v1/trusted-roots/:rootKeyId', handler))
    const response = await toWebHandler(app)(new Request('http://localhost/api/v1/trusted-roots/primary'))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject(primary)
    expect(siteTrustedRoot(env, now)).toEqual(parseTrustedRoot(JSON.stringify(primary), now))
  })

  it('rejects two valid primary roots for both publication and site verification', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const env = {
      ARTIFACT_TRUSTED_ROOTS_JSON: JSON.stringify([root('primary'), root('primary')]),
      ARTIFACT_TRUSTED_ROOT_JSON: trustedRoot(),
    }
    expect(parseTrustedRoots(env.ARTIFACT_TRUSTED_ROOTS_JSON, now)).toEqual([])
    expect(() => siteTrustedRoot(env, now)).toThrow('The selected site trusted root is invalid')
  })

  it('keeps an invalid first entry fail-closed when a valid root repeats its ID', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const primary = root('primary')
    const env = {
      ARTIFACT_TRUSTED_ROOTS_JSON: JSON.stringify([{ ...primary, keys: [] }, primary]),
      ARTIFACT_TRUSTED_ROOT_JSON: trustedRoot(),
    }
    expect(() => siteTrustedRoot(env, now)).toThrow('The selected site trusted root is invalid')
    expect(parseTrustedRoots(env.ARTIFACT_TRUSTED_ROOTS_JSON, now)).toEqual([parseTrustedRoot(JSON.stringify(primary), now)])
  })

  it('rejects ambiguous ids without disabling unrelated roots', () => {
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    const backup = root('backup')
    expect(parseTrustedRoots(JSON.stringify([root('primary'), root('primary'), backup]), now))
      .toEqual([parseTrustedRoot(JSON.stringify(backup), now)])
    report.mockRestore()
  })

  it('keeps site verification and the primary root available with a malformed backup', () => {
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    const primary = root('primary')
    const env = {
      ARTIFACT_TRUSTED_ROOTS_JSON: JSON.stringify([primary, { ...root('backup'), keys: [] }]),
      ARTIFACT_TRUSTED_ROOT_JSON: trustedRoot(),
    }
    expect(siteTrustedRoot(env, now)).toEqual(parseTrustedRoot(JSON.stringify(primary), now))
    expect(parseTrustedRoots(env.ARTIFACT_TRUSTED_ROOTS_JSON, now)).toEqual([siteTrustedRoot(env, now)])
    expect(report).toHaveBeenCalled()
    report.mockRestore()
  })

  it('serves the backup with a malformed primary but keeps site verification fail-closed', () => {
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    const backup = root('backup')
    const env = {
      ARTIFACT_TRUSTED_ROOTS_JSON: JSON.stringify([{ ...root('primary'), keys: [] }, backup]),
      ARTIFACT_TRUSTED_ROOT_JSON: trustedRoot(),
    }
    expect(parseTrustedRoots(env.ARTIFACT_TRUSTED_ROOTS_JSON, now)).toEqual([parseTrustedRoot(JSON.stringify(backup), now)])
    expect(() => siteTrustedRoot(env, now)).toThrow()
    report.mockRestore()
  })

  it('verifies attestations with the first served root', () => {
    const env = {
      ARTIFACT_TRUSTED_ROOTS_JSON: JSON.stringify([root('skilld-root-2026-11'), root('skilld-root-backup-2026-11')]),
      ARTIFACT_TRUSTED_ROOT_JSON: trustedRoot(),
    }

    expect(siteTrustedRoot(env, now).rootKeyId).toBe('skilld-root-2026-11')
  })

  it('verifies with the legacy root while no roots are served', () => {
    expect(siteTrustedRoot({ ARTIFACT_TRUSTED_ROOTS_JSON: '', ARTIFACT_TRUSTED_ROOT_JSON: trustedRoot() }, now).rootKeyId)
      .toBe('skilld-root-2026')
  })
})
