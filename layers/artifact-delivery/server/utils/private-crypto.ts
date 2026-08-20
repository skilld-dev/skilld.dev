import { base64ToBytes, bytesToBase64Url, digestHex } from './encoding'

const PRIVATE_ARTIFACT_VERSION = 1
const AES_KEY_BYTES = 32
const AES_GCM_IV_BYTES = 12
const MAX_PRIVATE_ARTIFACT_BYTES = 10 * 1024 * 1024

export interface PrivateArtifactAccountKey {
  keyId: string
  bytes: Uint8Array
}

export interface PrivateArtifactKeyProvider {
  active: (accountId: number) => Promise<PrivateArtifactAccountKey>
  byId: (accountId: number, keyId: string) => Promise<PrivateArtifactAccountKey | null>
}

export interface PrivateArtifactIdentity {
  accountId: number
  artifactId: string
  resolutionId: string
}

export interface EncryptPrivateArtifactInput extends PrivateArtifactIdentity {
  bytes: Uint8Array
}

export interface EncryptedPrivateArtifact {
  ciphertext: Uint8Array
  ciphertextSha256: string
  keyId: string
}

export function createD1PrivateArtifactKeyProvider(
  db: D1Database,
  encodedMasterKey: string,
  now: () => number = () => Math.floor(Date.now() / 1000),
): PrivateArtifactKeyProvider {
  const loadMasterKey = async (): Promise<CryptoKey> => {
    const bytes = decodeCanonicalBase64Url(encodedMasterKey)
    if (!bytes || bytes.byteLength !== AES_KEY_BYTES)
      throw new Error('Private Artifact wrapping key must be 32 base64url bytes')
    return await crypto.subtle.importKey('raw', toArrayBuffer(bytes), 'AES-KW', false, ['wrapKey', 'unwrapKey'])
  }

  const unwrap = async (accountId: number, row: { key_id: string, wrapped_key: string }): Promise<PrivateArtifactAccountKey> => {
    const wrapped = decodeCanonicalBase64Url(row.wrapped_key)
    if (!wrapped)
      throw new Error('Private Artifact account key is malformed')
    const key = await crypto.subtle.unwrapKey(
      'raw',
      toArrayBuffer(wrapped),
      await loadMasterKey(),
      'AES-KW',
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    )
    const bytes = new Uint8Array(await crypto.subtle.exportKey('raw', key))
    if (bytes.byteLength !== AES_KEY_BYTES)
      throw new Error('Private Artifact account key has another size')
    return { keyId: row.key_id, bytes }
  }

  const byId = async (accountId: number, keyId: string): Promise<PrivateArtifactAccountKey | null> => {
    const row = await db.prepare(
      `SELECT key_id, wrapped_key
       FROM private_artifact_keys
       WHERE account_id = ?1 AND key_id = ?2 AND state IN ('active', 'retired')
       LIMIT 1`,
    ).bind(accountId, keyId).first<{ key_id: string, wrapped_key: string }>()
    return row ? await unwrap(accountId, row) : null
  }

  return {
    byId,
    async active(accountId) {
      const existing = await db.prepare(
        `SELECT key_id, wrapped_key
         FROM private_artifact_keys
         WHERE account_id = ?1 AND state = 'active'
         LIMIT 1`,
      ).bind(accountId).first<{ key_id: string, wrapped_key: string }>()
      if (existing)
        return await unwrap(accountId, existing)

      const accountKey = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt'],
      )
      const wrapped = await crypto.subtle.wrapKey('raw', accountKey, await loadMasterKey(), 'AES-KW')
      const keyId = `account-${crypto.randomUUID()}`
      const inserted = await db.prepare(
        `INSERT OR IGNORE INTO private_artifact_keys (
           account_id, key_id, wrapped_key, wrap_algorithm, state, created_at
         ) VALUES (?1, ?2, ?3, 'A256KW', 'active', ?4)`,
      ).bind(accountId, keyId, bytesToBase64Url(new Uint8Array(wrapped)), now()).run()
      if (Number(inserted.meta.changes) === 1) {
        return {
          keyId,
          bytes: new Uint8Array(await crypto.subtle.exportKey('raw', accountKey)),
        }
      }
      const raced = await db.prepare(
        `SELECT key_id, wrapped_key
         FROM private_artifact_keys
         WHERE account_id = ?1 AND state = 'active'
         LIMIT 1`,
      ).bind(accountId).first<{ key_id: string, wrapped_key: string }>()
      if (!raced)
        throw new Error('Private Artifact account key race could not be loaded')
      return await unwrap(accountId, raced)
    },
  }
}

export async function encryptPrivateArtifact(
  keys: PrivateArtifactKeyProvider,
  input: EncryptPrivateArtifactInput,
): Promise<EncryptedPrivateArtifact> {
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_PRIVATE_ARTIFACT_BYTES)
    throw new Error('Private Artifact content exceeds the byte limit')
  const accountKey = await keys.active(input.accountId)
  const artifactKey = await deriveArtifactKey(accountKey.bytes, input)
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES))
  const encrypted = await crypto.subtle.encrypt({
    name: 'AES-GCM',
    iv: toArrayBuffer(iv),
    additionalData: toArrayBuffer(identityBytes(input)),
    tagLength: 128,
  }, artifactKey, toArrayBuffer(input.bytes))
  const ciphertext = new Uint8Array(1 + iv.byteLength + encrypted.byteLength)
  ciphertext[0] = PRIVATE_ARTIFACT_VERSION
  ciphertext.set(iv, 1)
  ciphertext.set(new Uint8Array(encrypted), 1 + iv.byteLength)
  return {
    ciphertext,
    ciphertextSha256: await digestHex('SHA-256', ciphertext),
    keyId: accountKey.keyId,
  }
}

export async function decryptPrivateArtifact(
  keys: PrivateArtifactKeyProvider,
  input: PrivateArtifactIdentity & {
    ciphertext: Uint8Array
    contentSha256: string
    contentBytes: number
    keyId: string
  },
): Promise<{ _tag: 'decrypted', bytes: Uint8Array } | { _tag: 'rejected' }> {
  if (
    input.ciphertext.byteLength <= 1 + AES_GCM_IV_BYTES + 16
    || input.ciphertext[0] !== PRIVATE_ARTIFACT_VERSION
    || input.contentBytes <= 0
    || input.contentBytes > MAX_PRIVATE_ARTIFACT_BYTES
  ) {
    return { _tag: 'rejected' }
  }
  const accountKey = await keys.byId(input.accountId, input.keyId)
  if (!accountKey)
    return { _tag: 'rejected' }
  const artifactKey = await deriveArtifactKey(accountKey.bytes, input)
  const iv = input.ciphertext.slice(1, 1 + AES_GCM_IV_BYTES)
  const encrypted = input.ciphertext.slice(1 + AES_GCM_IV_BYTES)
  const decrypted = await crypto.subtle.decrypt({
    name: 'AES-GCM',
    iv: toArrayBuffer(iv),
    additionalData: toArrayBuffer(identityBytes(input)),
    tagLength: 128,
  }, artifactKey, toArrayBuffer(encrypted))
    .then(bytes => ({ _tag: 'ok' as const, bytes: new Uint8Array(bytes) }))
    .catch(() => ({ _tag: 'invalid' as const }))
  if (decrypted._tag === 'invalid')
    return { _tag: 'rejected' }
  if (
    decrypted.bytes.byteLength !== input.contentBytes
    || await digestHex('SHA-256', decrypted.bytes) !== input.contentSha256
    || input.artifactId !== `sha256:${input.contentSha256}`
  ) {
    return { _tag: 'rejected' }
  }
  return { _tag: 'decrypted', bytes: decrypted.bytes }
}

async function deriveArtifactKey(
  accountKeyBytes: Uint8Array,
  identity: PrivateArtifactIdentity,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey('raw', toArrayBuffer(accountKeyBytes), 'HKDF', false, ['deriveKey'])
  const salt = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`skilld-private-account-v1\0${identity.accountId}`),
  )
  return await crypto.subtle.deriveKey({
    name: 'HKDF',
    hash: 'SHA-256',
    salt,
    info: toArrayBuffer(identityBytes(identity)),
  }, baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

function identityBytes(identity: PrivateArtifactIdentity): Uint8Array {
  return new TextEncoder().encode(
    `skilld-private-artifact-v1\0${identity.accountId}\0${identity.artifactId}\0${identity.resolutionId}`,
  )
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer
}

function decodeCanonicalBase64Url(value: string): Uint8Array | null {
  try {
    const bytes = base64ToBytes(value)
    return bytesToBase64Url(bytes) === value ? bytes : null
  }
  catch {
    return null
  }
}
