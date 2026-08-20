import type {
  ArtifactAttestation,
  ArtifactFile,
  attestationSignatureSchema,
  CheckResult,
  ResolvedSource,
} from '../schemas/contracts'
import type { TrustedRoot } from './trusted-root'
import { z } from 'zod'
import { base64ToBytes, canonicalJson } from './encoding'
import { ARTIFACT_POLICY_VERSION } from './state'

export interface ArtifactAttestationStatement {
  version: 1
  artifactId: string
  createdAt: string
  source: ResolvedSource
  sourceStatus: 'verified'
  format: 'skilld-tar-v1'
  contentSha256: string
  contentBytes: number
  policyVersion: string
  files: ArtifactFile[]
  checkResults: CheckResult[]
}

export interface ArtifactSigner {
  sign: (input: { resolutionId: string, artifactId: string }) => Promise<z.infer<typeof attestationSignatureSchema>>
}

const signerResponseSchema = z.object({
  algorithm: z.literal('Ed25519'),
  keyId: z.string().min(1).max(100),
  value: z.string().min(86).max(88),
}).strict()
const MAX_SIGNER_RESPONSE_BYTES = 8192

export function createAttestationStatement(input: {
  artifactId: string
  createdAt: string
  source: ResolvedSource
  contentSha256: string
  contentBytes: number
  files: ArtifactFile[]
  checkResults: CheckResult[]
}): ArtifactAttestationStatement {
  return {
    version: 1,
    artifactId: input.artifactId,
    createdAt: input.createdAt,
    source: input.source,
    sourceStatus: 'verified',
    format: 'skilld-tar-v1',
    contentSha256: input.contentSha256,
    contentBytes: input.contentBytes,
    policyVersion: ARTIFACT_POLICY_VERSION,
    files: input.files,
    checkResults: input.checkResults,
  }
}

export function encodeAttestationStatement(statement: ArtifactAttestationStatement): string {
  return canonicalJson(statement)
}

export function completeAttestation(
  statement: ArtifactAttestationStatement,
  signature: z.infer<typeof attestationSignatureSchema>,
): ArtifactAttestation {
  return { ...statement, signature }
}

export async function verifyAttestationSignature(
  statement: ArtifactAttestationStatement,
  signature: z.infer<typeof attestationSignatureSchema>,
  trustedRoot: TrustedRoot,
  now: number,
): Promise<boolean> {
  const trustedKey = trustedRoot.keys.find(key => key.keyId === signature.keyId)
  if (!trustedKey || trustedKey.status === 'retired' || trustedKey.status === 'revoked')
    return false
  if (now < Date.parse(trustedKey.notBefore) / 1000 || now >= Date.parse(trustedKey.notAfter) / 1000)
    return false
  const publicKey = await crypto.subtle.importKey(
    'raw',
    Uint8Array.from(base64ToBytes(trustedKey.publicKey)).buffer,
    'Ed25519',
    false,
    ['verify'],
  )
  return await crypto.subtle.verify(
    'Ed25519',
    publicKey,
    Uint8Array.from(base64ToBytes(signature.value)).buffer,
    new TextEncoder().encode(encodeAttestationStatement(statement)),
  )
}

/**
 * The signing Worker receives only an Artifact identity.
 *
 * It must load the staged statement and current required check results from
 * D1. It must reject blocked or changed statements. This keeps the public site
 * Worker from asking the signer to sign arbitrary bytes.
 */
export function createArtifactSigner(service: Fetcher): ArtifactSigner {
  return {
    async sign(input) {
      const response = await service.fetch(new Request('https://artifact-signer.internal/v1/attest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      }))
      if (!response.ok)
        throw new Error(`Artifact signer returned ${response.status}`)
      return signerResponseSchema.parse(await readBoundedJson(response, MAX_SIGNER_RESPONSE_BYTES))
    },
  }
}

async function readBoundedJson(response: Response, maximumBytes: number): Promise<unknown> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maximumBytes)
    throw new Error('Artifact signer response exceeded the byte limit')
  if (!response.body)
    throw new Error('Artifact signer returned an empty response')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const next = await reader.read()
    if (next.done)
      break
    size += next.value.byteLength
    if (size > maximumBytes) {
      await reader.cancel('response too large')
      throw new Error('Artifact signer response exceeded the byte limit')
    }
    chunks.push(next.value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown
}
