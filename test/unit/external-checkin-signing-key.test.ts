import type { RootKeyWindow } from '../../checks/_helpers/signing-key'
import type { ArtifactSigningKeyWindow } from '../../workers/artifact-signer/src/slots'
import { describe, expect, it } from 'vitest'
import { evaluateSigningKeys, fetchRootKeys, parseSignerKeys } from '../../checks/_helpers/signing-key'

const seconds = (value: string) => Date.parse(value) / 1000

const OLD_SIGNER: ArtifactSigningKeyWindow = {
  slot: 'primary',
  keyId: 'skilld-production-2026-08',
  notBefore: seconds('2026-08-20T00:00:00.000Z'),
  notAfter: seconds('2026-11-20T00:00:00.000Z'),
}
const NEW_SIGNER: ArtifactSigningKeyWindow = {
  slot: 'secondary',
  keyId: 'skilld-production-2026-11',
  notBefore: seconds('2026-10-20T00:00:00.000Z'),
  notAfter: seconds('2027-05-20T00:00:00.000Z'),
}
const OLD_ROOT: RootKeyWindow = { keyId: OLD_SIGNER.keyId, status: 'active', notBefore: OLD_SIGNER.notBefore, notAfter: OLD_SIGNER.notAfter }
const NEW_ROOT: RootKeyWindow = { keyId: NEW_SIGNER.keyId, status: 'active', notBefore: NEW_SIGNER.notBefore, notAfter: NEW_SIGNER.notAfter }

describe('signing key check', () => {
  it('passes with more than 30 days of signing left', () => {
    const result = evaluateSigningKeys({ signer: [OLD_SIGNER], root: [OLD_ROOT], now: seconds('2026-10-07T00:00:00.000Z') })

    expect(result).toMatchObject({ _tag: 'Pass', evidence: { signingKeyId: OLD_SIGNER.keyId, signingEndsAt: '2026-11-20T00:00:00.000Z', daysLeft: 44 } })
  })

  it.each([
    ['2026-10-20T23:59:59.000Z', 'Pass'],
    ['2026-10-21T00:00:00.000Z', 'Warn'],
    ['2026-11-13T00:00:00.000Z', 'Fail'],
  ] as const)('reads %s as %s', (now, tag) => {
    expect(evaluateSigningKeys({ signer: [OLD_SIGNER], root: [OLD_ROOT], now: seconds(now) })._tag).toBe(tag)
  })

  it('fails once no signer key window holds now', () => {
    const result = evaluateSigningKeys({ signer: [OLD_SIGNER], root: [OLD_ROOT], now: seconds('2026-11-20T00:00:00.000Z') })

    expect(result).toMatchObject({ _tag: 'Fail', reason: expect.stringContaining('no key whose window holds now') })
  })

  it('counts the overlapping next key as more signing time', () => {
    const result = evaluateSigningKeys({ signer: [OLD_SIGNER, NEW_SIGNER], root: [OLD_ROOT, NEW_ROOT], now: seconds('2026-11-15T00:00:00.000Z') })

    expect(result).toMatchObject({ _tag: 'Pass', evidence: { signingKeyId: NEW_SIGNER.keyId, signingEndsAt: '2027-05-20T00:00:00.000Z' } })
  })

  it('ends signing where the trusted root window ends, when it ends before the signer window', () => {
    const result = evaluateSigningKeys({
      signer: [NEW_SIGNER],
      root: [{ ...NEW_ROOT, notAfter: seconds('2027-02-20T00:00:00.000Z') }],
      now: seconds('2027-02-01T00:00:00.000Z'),
    })

    expect(result).toMatchObject({ _tag: 'Warn', evidence: { signingEndsAt: '2027-02-20T00:00:00.000Z', daysLeft: 19 } })
  })

  it('warns when the signer will start a key the trusted root does not trust', () => {
    const result = evaluateSigningKeys({ signer: [OLD_SIGNER, NEW_SIGNER], root: [OLD_ROOT], now: seconds('2026-10-10T00:00:00.000Z') })

    expect(result).toMatchObject({ _tag: 'Warn', reason: expect.stringContaining('skilld-production-2026-11') })
  })

  it.each([
    ['missing', [OLD_ROOT]],
    ['retired', [OLD_ROOT, { ...NEW_ROOT, status: 'retired' as const }]],
  ])('fails when the signer signs with a key the trusted root lists as %s', (_name, root) => {
    const result = evaluateSigningKeys({ signer: [OLD_SIGNER, NEW_SIGNER], root, now: seconds('2026-10-25T00:00:00.000Z') })

    expect(result).toMatchObject({ _tag: 'Fail', reason: expect.stringContaining('does not trust that key now') })
  })
})

describe('signing key evidence', () => {
  it('reads each filled signer slot and skips an empty one', () => {
    expect(parseSignerKeys({
      ARTIFACT_SIGNING_KEY_ID: OLD_SIGNER.keyId,
      ARTIFACT_SIGNING_KEY_NOT_BEFORE: '2026-08-20T00:00:00.000Z',
      ARTIFACT_SIGNING_KEY_NOT_AFTER: '2026-11-20T00:00:00.000Z',
      ARTIFACT_SIGNING_MAX_AGE_SECONDS: '300',
    })).toEqual([OLD_SIGNER])
  })

  it('throws on a slot with a key ID and no window', () => {
    expect(() => parseSignerKeys({ ARTIFACT_SIGNING_SECONDARY_KEY_ID: NEW_SIGNER.keyId })).toThrow()
  })

  it('reads key windows from the trusted root answer', async () => {
    const request = async () => Response.json({
      version: 1,
      rootKeyId: 'skilld-root-2026',
      keys: [{ keyId: OLD_SIGNER.keyId, status: 'active', notBefore: '2026-08-20T00:00:00.000Z', notAfter: '2026-11-20T00:00:00.000Z', publicKey: 'B'.repeat(43) }],
    })

    expect(await fetchRootKeys(new AbortController().signal, request)).toEqual([OLD_ROOT])
  })

  it('throws when the trusted root answers an error', async () => {
    const request = async () => new Response('down', { status: 503 })

    await expect(fetchRootKeys(new AbortController().signal, request)).rejects.toThrow('HTTP 503')
  })
})
