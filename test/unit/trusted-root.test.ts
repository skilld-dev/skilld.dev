import { describe, expect, it } from 'vitest'
import { bytesToBase64Url } from '../../layers/artifact-delivery/server/utils/encoding'
import { parseTrustedRoot } from '../../layers/artifact-delivery/server/utils/trusted-root'

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
