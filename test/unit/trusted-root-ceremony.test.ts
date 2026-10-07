import type { TrustedRootConfig } from '../../scripts/lib/trusted-root-ceremony'
import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { parseTrustedRoot } from '../../layers/artifact-delivery/server/utils/trusted-root'
import {
  addTrustedKey,
  generateSigningKey,
  parseRootConfig,
  publicKeyOf,
  readPrivateKey,
  removeTrustedKey,
  signingKeyMatches,
  verifyTrustedRoot,
} from '../../scripts/lib/trusted-root-ceremony'

const NOW = Date.parse('2026-10-07T00:00:00.000Z') / 1000

function ceremony() {
  const { privateKey: rootPrivateKey } = generateKeyPairSync('ed25519')
  const empty: TrustedRootConfig = { version: 1, rootKeyId: 'skilld-root-2026', rootPublicKey: publicKeyOf(rootPrivateKey), keys: [] }
  const pin = { rootKeyId: empty.rootKeyId, rootPublicKey: empty.rootPublicKey }
  const oldKey = generateSigningKey()
  const newKey = generateSigningKey()
  const current = addTrustedKey(empty, rootPrivateKey, {
    keyId: 'skilld-production-2026-08',
    publicKey: oldKey.publicKey,
    notBefore: '2026-08-20T00:00:00.000Z',
    notAfter: '2026-11-20T00:00:00.000Z',
    status: 'active',
  })
  return { rootPrivateKey, pin, oldKey, newKey, current }
}

describe('trusted root ceremony', () => {
  it('adds a root-signed key that the CLI rules and the site parser both accept', () => {
    const { rootPrivateKey, pin, newKey, current } = ceremony()

    const next = addTrustedKey(current, rootPrivateKey, {
      keyId: 'skilld-production-2026-11',
      publicKey: newKey.publicKey,
      notBefore: '2026-10-14T00:00:00Z',
      notAfter: '2027-05-20T00:00:00Z',
      status: 'active',
    })

    expect(verifyTrustedRoot(next, pin, NOW)).toEqual({ _tag: 'valid' })
    expect(parseTrustedRoot(JSON.stringify(next), NOW).keys.map(key => [key.keyId, key.notBefore])).toEqual([
      ['skilld-production-2026-08', '2026-08-20T00:00:00.000Z'],
      ['skilld-production-2026-11', '2026-10-14T00:00:00.000Z'],
    ])
  })

  it('refuses a root private key that does not match the root public key', () => {
    const { pin: _pin, newKey, current } = ceremony()
    const { privateKey: otherRoot } = generateKeyPairSync('ed25519')

    expect(() => addTrustedKey(current, otherRoot, {
      keyId: 'skilld-production-2026-11',
      publicKey: newKey.publicKey,
      notBefore: '2026-10-14T00:00:00Z',
      notAfter: '2027-05-20T00:00:00Z',
      status: 'active',
    })).toThrow('does not match rootPublicKey')
  })

  it('reports a status changed without a new root signature', () => {
    const { pin, current } = ceremony()
    const changed = { ...current, keys: current.keys.map(key => ({ ...key, status: 'retired' as const })) }

    expect(verifyTrustedRoot(changed, pin, NOW)).toEqual({
      _tag: 'invalid',
      problems: [
        'skilld-production-2026-08: the signed statement does not match the key fields.',
        'The site parser rejects this root.',
      ],
    })
  })

  it('reports a key signed by another root key', () => {
    const { pin, newKey, current } = ceremony()
    const { privateKey: otherRoot } = generateKeyPairSync('ed25519')
    const forged = addTrustedKey({ ...current, rootPublicKey: publicKeyOf(otherRoot) }, otherRoot, {
      keyId: 'skilld-production-2026-11',
      publicKey: newKey.publicKey,
      notBefore: '2026-10-14T00:00:00Z',
      notAfter: '2027-05-20T00:00:00Z',
      status: 'active',
    })

    const result = verifyTrustedRoot({ ...forged, rootPublicKey: pin.rootPublicKey }, pin, NOW)

    expect(result).toEqual({ _tag: 'invalid', problems: ['skilld-production-2026-11: the root signature does not verify.'] })
  })

  it('reports a root key that differs from the CLI pin', () => {
    const { current } = ceremony()
    const { privateKey: otherRoot } = generateKeyPairSync('ed25519')

    const result = verifyTrustedRoot(current, { rootKeyId: current.rootKeyId, rootPublicKey: publicKeyOf(otherRoot) }, NOW)

    expect(result).toMatchObject({ _tag: 'invalid', problems: expect.arrayContaining(['The root key differs from the pin the released CLIs carry.']) })
  })

  it('removes a key without the root key, and keeps at least one', () => {
    const { rootPrivateKey, pin, newKey, current } = ceremony()
    const both = addTrustedKey(current, rootPrivateKey, {
      keyId: 'skilld-production-2026-11',
      publicKey: newKey.publicKey,
      notBefore: '2026-10-14T00:00:00Z',
      notAfter: '2027-05-20T00:00:00Z',
      status: 'active',
    })

    const next = removeTrustedKey(both, 'skilld-production-2026-08')

    expect(next.keys.map(key => key.keyId)).toEqual(['skilld-production-2026-11'])
    expect(verifyTrustedRoot(next, pin, NOW)).toEqual({ _tag: 'valid' })
    expect(() => removeTrustedKey(next, 'skilld-production-2026-11')).toThrow('at least one')
  })

  it('reads the live answer as the secret value, without fetchedAt', () => {
    const { current } = ceremony()

    expect(parseRootConfig({ ...current, fetchedAt: '2026-10-07T00:00:00.000Z' })).toEqual(current)
  })

  it('matches a signer secret to its key ID', () => {
    const { oldKey, newKey, current } = ceremony()

    expect(signingKeyMatches(current, 'skilld-production-2026-08', readPrivateKey(oldKey.privateKeyPkcs8))).toBe(true)
    expect(signingKeyMatches(current, 'skilld-production-2026-08', readPrivateKey(newKey.privateKeyPkcs8))).toBe(false)
  })
})
