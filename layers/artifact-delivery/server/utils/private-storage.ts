import type { PrivateArtifactKeyProvider } from './private-crypto'
import { digestHex } from './encoding'
import { decryptPrivateArtifact, encryptPrivateArtifact } from './private-crypto'

export interface StoredPrivateArtifact {
  _tag: 'stored' | 'existing'
  key: string
  ciphertextSha256: string
  ciphertextBytes: number
  encryptionKeyId: string
}

export type PrivateArtifactStorageResult
  = StoredPrivateArtifact
    | { _tag: 'mutation-rejected', key: string }

export async function privateArtifactR2Key(accountId: number, resolutionId: string): Promise<string> {
  const accountHash = await digestHex('SHA-256', String(accountId))
  return `v1/private/${accountHash.slice(0, 16)}/${resolutionId}.bin`
}

export async function putPrivateArtifact(
  bucket: R2Bucket,
  keys: PrivateArtifactKeyProvider,
  input: {
    accountId: number
    artifactId: string
    resolutionId: string
    bytes: Uint8Array
    contentSha256: string
  },
): Promise<PrivateArtifactStorageResult> {
  if (
    input.bytes.byteLength === 0
    || await digestHex('SHA-256', input.bytes) !== input.contentSha256
    || input.artifactId !== `sha256:${input.contentSha256}`
  ) {
    throw new Error('Private Artifact plaintext identity changed before storage')
  }
  const key = await privateArtifactR2Key(input.accountId, input.resolutionId)
  const accountIdHash = await digestHex('SHA-256', String(input.accountId))
  const encrypted = await encryptPrivateArtifact(keys, input)
  const stored = await bucket.put(key, encrypted.ciphertext, {
    onlyIf: { etagDoesNotMatch: '*' },
    sha256: checksumBytes(encrypted.ciphertextSha256),
    httpMetadata: {
      contentType: 'application/octet-stream',
      cacheControl: 'private, no-store',
    },
    customMetadata: {
      accountIdHash,
      artifactId: input.artifactId,
      ciphertextSha256: encrypted.ciphertextSha256,
      contentSha256: input.contentSha256,
      encryptionKeyId: encrypted.keyId,
      format: 'skilld-private-artifact-v1',
      resolutionId: input.resolutionId,
    },
  })
  if (stored) {
    return {
      _tag: 'stored',
      key,
      ciphertextSha256: encrypted.ciphertextSha256,
      ciphertextBytes: encrypted.ciphertext.byteLength,
      encryptionKeyId: encrypted.keyId,
    }
  }

  const existing = await bucket.get(key)
  if (!existing || !('arrayBuffer' in existing))
    return { _tag: 'mutation-rejected', key }
  const ciphertext = new Uint8Array(await existing.arrayBuffer())
  const ciphertextSha256 = await digestHex('SHA-256', ciphertext)
  const keyId = existing.customMetadata?.encryptionKeyId
  if (
    existing.size !== ciphertext.byteLength
    || existing.customMetadata?.accountIdHash !== accountIdHash
    || existing.customMetadata?.artifactId !== input.artifactId
    || existing.customMetadata?.contentSha256 !== input.contentSha256
    || existing.customMetadata?.ciphertextSha256 !== ciphertextSha256
    || existing.customMetadata?.format !== 'skilld-private-artifact-v1'
    || existing.customMetadata?.resolutionId !== input.resolutionId
    || !keyId
  ) {
    return { _tag: 'mutation-rejected', key }
  }
  const decrypted = await decryptPrivateArtifact(keys, {
    accountId: input.accountId,
    artifactId: input.artifactId,
    resolutionId: input.resolutionId,
    ciphertext,
    contentSha256: input.contentSha256,
    contentBytes: input.bytes.byteLength,
    keyId,
  })
  if (decrypted._tag === 'rejected' || !equalBytes(decrypted.bytes, input.bytes))
    return { _tag: 'mutation-rejected', key }
  return {
    _tag: 'existing',
    key,
    ciphertextSha256,
    ciphertextBytes: ciphertext.byteLength,
    encryptionKeyId: keyId,
  }
}

function checksumBytes(value: string): Uint8Array {
  return Uint8Array.from(value.match(/.{2}/g) ?? [], byte => Number.parseInt(byte, 16))
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength)
    return false
  let different = 0
  for (let index = 0; index < left.byteLength; index++)
    different |= left[index]! ^ right[index]!
  return different === 0
}
