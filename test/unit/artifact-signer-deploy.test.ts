import type { TrustedRootConfig } from '../../scripts/lib/trusted-root-ceremony'
import { generateKeyPairSync } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { deployArtifactSigner } from '../../scripts/lib/artifact-signer-deploy'
import { addTrustedKey, generateSigningKey, publicKeyOf, readPrivateKey, signingKeyMatches } from '../../scripts/lib/trusted-root-ceremony'

function fixture() {
  const { privateKey } = generateKeyPairSync('ed25519')
  const primary = generateSigningKey()
  const secondary = generateSigningKey()
  const empty: TrustedRootConfig = { version: 1, rootKeyId: 'skilld-root-2026-11', rootPublicKey: publicKeyOf(privateKey), keys: [] }
  const primaryRoot = addTrustedKey(empty, privateKey, {
    keyId: 'skilld-production-2026-08',
    publicKey: primary.publicKey,
    notBefore: '2026-08-20T00:00:00.000Z',
    notAfter: '2026-11-20T00:00:00.000Z',
    status: 'active',
  })
  const root = addTrustedKey(primaryRoot, privateKey, {
    keyId: 'skilld-production-2026-11',
    publicKey: secondary.publicKey,
    notBefore: '2026-11-19T20:00:00.000Z',
    notAfter: '2027-05-20T00:00:00.000Z',
    status: 'active',
  })
  return {
    root,
    now: Date.parse('2026-11-19T16:00:00Z') / 1000,
    vars: {
      ARTIFACT_SIGNING_KEY_ID: 'skilld-production-2026-08',
      ARTIFACT_SIGNING_KEY_NOT_BEFORE: '2026-08-20T00:00:00.000Z',
      ARTIFACT_SIGNING_KEY_NOT_AFTER: '2026-11-20T00:00:00.000Z',
      ARTIFACT_SIGNING_SECONDARY_KEY_ID: 'skilld-production-2026-11',
      ARTIFACT_SIGNING_SECONDARY_KEY_NOT_BEFORE: '2026-11-19T20:00:00.000Z',
      ARTIFACT_SIGNING_SECONDARY_KEY_NOT_AFTER: '2027-05-20T00:00:00.000Z',
    },
    secrets: {
      ARTIFACT_SIGNING_PRIVATE_KEY_PKCS8: primary.privateKeyPkcs8,
      ARTIFACT_SIGNING_SECONDARY_PRIVATE_KEY_PKCS8: secondary.privateKeyPkcs8,
    },
  }
}

describe('artifact signer rotation preflight', () => {
  it('rejects a valid secondary private key that differs from the root before cutover', async () => {
    const input = fixture()
    input.secrets.ARTIFACT_SIGNING_SECONDARY_PRIVATE_KEY_PKCS8 = generateSigningKey().privateKeyPkcs8
    let deployed = false

    await expect(deployArtifactSigner({ ...input, command: async () => {
      deployed = true
      return { _tag: 'passed', stdout: '', stderr: '' }
    } })).rejects.toThrow('Signing key preflight failed')
    expect(deployed).toBe(false)
  })

  it('deploys the matching checked keys atomically before cutover', async () => {
    const input = fixture()
    let deployedMatchingKey = false
    let secretsFile = ''
    const result = await deployArtifactSigner({ ...input, command: async (args) => {
      const file = args[args.indexOf('--secrets-file') + 1]!
      secretsFile = file
      expect((await stat(file)).mode & 0o777).toBe(0o600)
      const secrets = JSON.parse(await readFile(file, 'utf8'))
      deployedMatchingKey = signingKeyMatches(input.root, 'skilld-production-2026-11', readPrivateKey(secrets.ARTIFACT_SIGNING_SECONDARY_PRIVATE_KEY_PKCS8))
        && signingKeyMatches(input.root, 'skilld-production-2026-08', readPrivateKey(secrets.ARTIFACT_SIGNING_PRIVATE_KEY_PKCS8))
      return { _tag: 'passed', stdout: '', stderr: '' }
    } })
    expect(result._tag).toBe('passed')
    expect(deployedMatchingKey).toBe(true)
    await expect(stat(secretsFile)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it.each(['missing', 'malformed', 'primary-mismatch', 'revoked', 'window', 'root-signature'] as const)(
    'stops deployment when preflight finds %s',
    async (problem) => {
      const input = fixture()
      if (problem === 'missing')
        input.secrets.ARTIFACT_SIGNING_SECONDARY_PRIVATE_KEY_PKCS8 = ''
      if (problem === 'malformed')
        input.secrets.ARTIFACT_SIGNING_SECONDARY_PRIVATE_KEY_PKCS8 = 'invalid-pkcs8'
      if (problem === 'primary-mismatch')
        input.secrets.ARTIFACT_SIGNING_PRIVATE_KEY_PKCS8 = generateSigningKey().privateKeyPkcs8
      if (problem === 'revoked')
        input.root.keys[1]!.status = 'revoked'
      if (problem === 'window')
        input.vars.ARTIFACT_SIGNING_SECONDARY_KEY_NOT_BEFORE = '2026-11-19T19:00:00.000Z'
      if (problem === 'root-signature')
        input.root.keys[1]!.rootSignature = input.root.keys[0]!.rootSignature
      let deployed = false
      await expect(deployArtifactSigner({ ...input, command: async () => {
        deployed = true
        return { _tag: 'passed', stdout: '', stderr: '' }
      } })).rejects.toThrow('Signing key preflight failed')
      expect(deployed).toBe(false)
    },
  )

  it('removes the key file when the deploy command throws', async () => {
    let file = ''
    await expect(deployArtifactSigner({ ...fixture(), command: async (args) => {
      file = args[args.indexOf('--secrets-file') + 1]!
      throw new Error('Deployment unavailable')
    } })).rejects.toThrow('Deployment unavailable')
    await expect(stat(file)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('preserves the old Worker secret when only the incoming key is supplied', async () => {
    const input = fixture()
    const { ARTIFACT_SIGNING_PRIVATE_KEY_PKCS8: _old, ...secrets } = input.secrets
    let incomingMatches = false
    const result = await deployArtifactSigner({ ...input, secrets, command: async (args) => {
      const uploaded = JSON.parse(await readFile(args[args.indexOf('--secrets-file') + 1]!, 'utf8'))
      incomingMatches = signingKeyMatches(input.root, 'skilld-production-2026-11', readPrivateKey(uploaded.ARTIFACT_SIGNING_SECONDARY_PRIVATE_KEY_PKCS8))
      // Omitted secrets survive Wrangler's additive secrets upload.
      expect(uploaded.ARTIFACT_SIGNING_PRIVATE_KEY_PKCS8).toBeUndefined()
      return { _tag: 'passed', stdout: '', stderr: '' }
    } })
    expect(result._tag).toBe('passed')
    expect(incomingMatches).toBe(true)
  })
})
