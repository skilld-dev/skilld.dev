import type { TrustedRootConfig } from '../../scripts/lib/trusted-root-ceremony'
import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { bytesToBase64Url } from '../../layers/artifact-delivery/server/utils/encoding'
import { parseTrustedRoot, parseTrustedRoots, siteTrustedRoot } from '../../layers/artifact-delivery/server/utils/trusted-root'
import { createTrustedRoot, generateSigningKey } from '../../scripts/lib/trusted-root-ceremony'

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

  it('reads every served root with its root key id', () => {
    const roots = parseTrustedRoots(JSON.stringify([root('skilld-root-2026-11'), root('skilld-root-backup-2026-11')]), now)

    expect(roots.map(served => served.rootKeyId)).toEqual(['skilld-root-2026-11', 'skilld-root-backup-2026-11'])
  })

  it('rejects two roots with the same root key id', () => {
    expect(() => parseTrustedRoots(JSON.stringify([root('skilld-root-2026-11'), root('skilld-root-2026-11')]), now))
      .toThrow('skilld-root-2026-11')
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
