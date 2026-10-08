import type { KeyObject } from 'node:crypto'
import type { z } from 'zod'
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto'
import { trustedKeyStatementSchema, trustedRootConfigSchema, trustedRootSchema } from '../../layers/artifact-delivery/server/schemas/contracts'
import { canonicalJson } from '../../layers/artifact-delivery/server/utils/encoding'
import { parseTrustedRoot } from '../../layers/artifact-delivery/server/utils/trusted-root'

/**
 * The signing ceremony for `ARTIFACT_TRUSTED_ROOT_JSON`: generate a signing
 * key, sign its statement with the offline root key, and check a root the way
 * the skilld CLI does.
 *
 * The site never checks a root signature. Every released CLI does, and a bad
 * one stops every `skilld run` with an upgrade message that no upgrade fixes.
 * `verifyTrustedRoot` is the gate before a root reaches production.
 */

export type TrustedRootConfig = z.infer<typeof trustedRootConfigSchema>
export type TrustedKeyStatus = z.infer<typeof trustedKeyStatementSchema>['status']

export interface RootPin {
  rootKeyId: string
  rootPublicKey: string
}

export interface NewTrustedKey {
  keyId: string
  publicKey: string
  notBefore: string
  notAfter: string
  status: Extract<TrustedKeyStatus, 'active' | 'overlapping'>
}

export type VerifyResult
  = { _tag: 'valid' }
    | { _tag: 'invalid', problems: string[] }

const TRUSTED_KEY_DOMAIN = Buffer.from('skilld-trusted-key-v1\0')
const STATEMENT_FIELDS = ['algorithm', 'keyId', 'notAfter', 'notBefore', 'publicKey', 'rootKeyId', 'status', 'version']

/** Reads a stored root, or a live `/api/v1/trusted-root` answer, as the secret value. */
export function parseRootConfig(value: unknown): TrustedRootConfig {
  const live = trustedRootSchema.safeParse(value)
  if (live.success) {
    const { fetchedAt: _fetchedAt, ...config } = live.data
    return config
  }
  return trustedRootConfigSchema.parse(value)
}

/** A new Ed25519 signing key: the signer secret value and its public key. */
export function generateSigningKey(): { privateKeyPkcs8: string, publicKey: string } {
  const { privateKey } = generateKeyPairSync('ed25519')
  return {
    privateKeyPkcs8: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64url'),
    publicKey: publicKeyOf(privateKey),
  }
}

/** Reads a PKCS8 Ed25519 private key from PEM text or base64url DER, as the signer secret holds it. */
export function readPrivateKey(text: string): KeyObject {
  const value = text.trim()
  const key = value.startsWith('-----BEGIN')
    ? createPrivateKey(value)
    : createPrivateKey({ key: Buffer.from(value, 'base64url'), format: 'der', type: 'pkcs8' })
  if (key.asymmetricKeyType !== 'ed25519')
    throw new Error('The private key is not an Ed25519 key.')
  return key
}

/** The raw public key as canonical base64url, the form the trusted root holds. */
export function publicKeyOf(key: KeyObject): string {
  const jwk = createPublicKey(key).export({ format: 'jwk' })
  if (typeof jwk.x !== 'string')
    throw new Error('The key has no Ed25519 public key.')
  return jwk.x
}

/** Adds one root-signed signing key. The root private key never leaves the caller. */
export function addTrustedKey(root: TrustedRootConfig, rootPrivateKey: KeyObject, key: NewTrustedKey): TrustedRootConfig {
  if (publicKeyOf(rootPrivateKey) !== root.rootPublicKey)
    throw new Error('The root private key does not match rootPublicKey.')
  if (root.keys.some(existing => existing.keyId === key.keyId))
    throw new Error(`The trusted root already holds ${key.keyId}.`)
  const notBefore = normalizeTimestamp(key.notBefore)
  const notAfter = normalizeTimestamp(key.notAfter)
  if (Date.parse(notBefore) >= Date.parse(notAfter))
    throw new Error('notBefore must be earlier than notAfter.')
  decodePublicKey(key.publicKey)
  const statement = trustedKeyStatementSchema.parse({
    version: 1,
    rootKeyId: root.rootKeyId,
    keyId: key.keyId,
    algorithm: 'Ed25519',
    publicKey: key.publicKey,
    notBefore,
    notAfter,
    status: key.status,
  })
  const statementBytes = Buffer.from(canonicalJson(statement))
  const rootSignature = sign(null, signedMessage(statementBytes), rootPrivateKey)
  return trustedRootConfigSchema.parse({
    ...root,
    keys: [...root.keys, {
      keyId: statement.keyId,
      algorithm: statement.algorithm,
      publicKey: statement.publicKey,
      notBefore: statement.notBefore,
      notAfter: statement.notAfter,
      status: statement.status,
      statement: statementBytes.toString('base64url'),
      rootSignature: rootSignature.toString('base64url'),
    }],
  })
}

/** Removes one signing key. Removal needs no root signature. */
export function removeTrustedKey(root: TrustedRootConfig, keyId: string): TrustedRootConfig {
  if (!root.keys.some(key => key.keyId === keyId))
    throw new Error(`The trusted root does not hold ${keyId}.`)
  const keys = root.keys.filter(key => key.keyId !== keyId)
  if (keys.length === 0)
    throw new Error('A trusted root must keep at least one signing key.')
  return { ...root, keys }
}

/**
 * Checks a root by the rules every released skilld CLI applies, then by the
 * site's own parser. Each failed rule is one problem.
 */
export function verifyTrustedRoot(root: TrustedRootConfig, pin: RootPin, now: number): VerifyResult {
  const problems: string[] = []
  if (root.rootKeyId !== pin.rootKeyId || root.rootPublicKey !== pin.rootPublicKey)
    problems.push('The root key differs from the pin the released CLIs carry.')
  const rootKey = attempt(() => decodePublicKey(root.rootPublicKey))
  if (!rootKey)
    problems.push('The root public key is not an Ed25519 key.')
  const seen = new Set<string>()
  for (const key of root.keys) {
    if (seen.has(key.keyId))
      problems.push(`${key.keyId}: the key ID appears twice.`)
    seen.add(key.keyId)
    const statementBytes = Buffer.from(key.statement, 'base64url')
    if (statementBytes.toString('base64url') !== key.statement) {
      problems.push(`${key.keyId}: the statement is not canonical base64url.`)
      continue
    }
    const statement = parseJson(statementBytes.toString('utf8'))
    const expected = {
      version: 1,
      rootKeyId: root.rootKeyId,
      keyId: key.keyId,
      algorithm: key.algorithm,
      publicKey: key.publicKey,
      notBefore: key.notBefore,
      notAfter: key.notAfter,
      status: key.status,
    }
    if (
      typeof statement !== 'object' || statement === null
      || canonicalJson(Object.keys(statement).sort()) !== canonicalJson(STATEMENT_FIELDS)
      || canonicalJson(statement) !== canonicalJson(expected)
    ) {
      problems.push(`${key.keyId}: the signed statement does not match the key fields.`)
    }
    if (!(Date.parse(key.notBefore) < Date.parse(key.notAfter)))
      problems.push(`${key.keyId}: the validity window is invalid.`)
    const publicKey = attempt(() => decodePublicKey(key.publicKey))
    if (!publicKey)
      problems.push(`${key.keyId}: the public key is not an Ed25519 key.`)
    const signature = Buffer.from(key.rootSignature, 'base64url')
    if (rootKey && (signature.toString('base64url') !== key.rootSignature || !verify(null, signedMessage(statementBytes), rootKey, signature)))
      problems.push(`${key.keyId}: the root signature does not verify.`)
  }
  const siteParse = attempt(() => parseTrustedRoot(JSON.stringify(root), now))
  if (!siteParse)
    problems.push('The site parser rejects this root.')
  return problems.length === 0 ? { _tag: 'valid' } : { _tag: 'invalid', problems }
}

/** True when the private key is the one the trusted root lists for `keyId`. */
export function signingKeyMatches(root: TrustedRootConfig, keyId: string, privateKey: KeyObject): boolean {
  return root.keys.some(key => key.keyId === keyId && key.publicKey === publicKeyOf(privateKey))
}

function signedMessage(statementBytes: Uint8Array): Buffer {
  return Buffer.concat([TRUSTED_KEY_DOMAIN, createHash('sha256').update(statementBytes).digest()])
}

function decodePublicKey(value: string): KeyObject {
  const bytes = Buffer.from(value, 'base64url')
  if (bytes.byteLength !== 32 || bytes.toString('base64url') !== value)
    throw new Error('A public key must be 32 bytes of canonical base64url.')
  return createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: value }, format: 'jwk' })
}

function normalizeTimestamp(value: string): string {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed) || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value))
    throw new Error(`${value} is not a UTC timestamp.`)
  return new Date(parsed).toISOString()
}

function parseJson(value: string): unknown {
  return attempt(() => JSON.parse(value) as unknown)
}

/** The value, or null when `run` throws. Each caller turns null into a named problem. */
function attempt<T>(run: () => T): T | null {
  try {
    return run()
  }
  catch {
    return null
  }
}
