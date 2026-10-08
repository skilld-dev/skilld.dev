import type { ArtifactAttestation } from '../../layers/artifact-delivery/server/schemas/contracts'
import type { TrustedRoot } from '../../layers/artifact-delivery/server/utils/trusted-root'
import { describe, expect, it } from 'vitest'
import {
  completeAttestation,
  createAttestationSignaturePayload,
  createAttestationStatement,
  encodeAttestationStatement,
  verifyArtifactAttestation,
} from '../../layers/artifact-delivery/server/utils/attestation'
import { bytesToBase64Url } from '../../layers/artifact-delivery/server/utils/encoding'

const KEY_NOT_BEFORE = Date.parse('2026-11-01T00:00:00.000Z') / 1000
const KEY_NOT_AFTER = Date.parse('2027-02-20T00:00:00.000Z') / 1000

describe('attestation signing key window', () => {
  it('accepts a statement created inside the key window', async () => {
    const signed = await signStatement(KEY_NOT_BEFORE + 60)

    expect(await verifyArtifactAttestation(signed.attestation, signed.trustedRoot, KEY_NOT_BEFORE + 120)).toBe(true)
  })

  // The skilld CLI accepts a signature only for a statement created inside
  // the key window. A site that checked only the current time stored, reused
  // and served a statement every CLI refuses.
  it('rejects a statement created before the key window opened', async () => {
    const signed = await signStatement(KEY_NOT_BEFORE - 60)

    expect(await verifyArtifactAttestation(signed.attestation, signed.trustedRoot, KEY_NOT_BEFORE + 120)).toBe(false)
  })

  it('stops accepting the key once its window closes, so the next request builds again', async () => {
    const signed = await signStatement(KEY_NOT_BEFORE + 60)

    expect(await verifyArtifactAttestation(signed.attestation, signed.trustedRoot, KEY_NOT_AFTER - 1)).toBe(true)
    expect(await verifyArtifactAttestation(signed.attestation, signed.trustedRoot, KEY_NOT_AFTER)).toBe(false)
  })
})

async function signStatement(createdAt: number): Promise<{ attestation: ArtifactAttestation, trustedRoot: TrustedRoot }> {
  const keyPair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])
  const publicKey = bytesToBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey)))
  const statement = encodeAttestationStatement(createAttestationStatement({
    artifactId: `sha256:${'a'.repeat(64)}`,
    createdAt: new Date(createdAt * 1000).toISOString(),
    source: {
      provider: 'github',
      repositoryId: 1,
      owner: 'skilld-dev',
      repository: 'skills',
      visibility: 'public',
      commitSha: '0123456789abcdef0123456789abcdef01234567',
      treeSha: '89abcdef0123456789abcdef0123456789abcdef',
      skillPath: 'skills/demo',
    },
    contentSha256: 'a'.repeat(64),
    contentBytes: 1024,
    files: [{ path: 'SKILL.md', mode: 420, size: 1, sha256: 'b'.repeat(64) }],
    checkResults: [{ name: 'path-policy', version: '1', outcome: 'pass', required: true }],
  }))
  const payload = await createAttestationSignaturePayload(new TextEncoder().encode(statement))
  const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', keyPair.privateKey, Uint8Array.from(payload).buffer))
  const attestation = completeAttestation(statement, {
    algorithm: 'Ed25519',
    keyId: 'skilld-production-2026-11',
    value: bytesToBase64Url(signature),
  })
  const trustedRoot: TrustedRoot = {
    version: 1,
    rootKeyId: 'skilld-root-2026',
    rootPublicKey: publicKey,
    keys: [{
      keyId: 'skilld-production-2026-11',
      algorithm: 'Ed25519',
      publicKey,
      notBefore: new Date(KEY_NOT_BEFORE * 1000).toISOString(),
      notAfter: new Date(KEY_NOT_AFTER * 1000).toISOString(),
      status: 'active',
      statement: bytesToBase64Url(new TextEncoder().encode('{}')),
      rootSignature: 'C'.repeat(86),
    }],
    fetchedAt: new Date(KEY_NOT_BEFORE * 1000).toISOString(),
  }
  return { attestation, trustedRoot }
}
