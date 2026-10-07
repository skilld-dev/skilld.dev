import type {
  ArtifactAttestation,
  ArtifactAttestationStatement,
  ArtifactFile,
  attestationSignatureSchema,
  CheckResult,
  LinkedArtifactFile,
  ResolvedSource,
} from '../schemas/contracts'
import type { TrustedRoot } from './trusted-root'
import { z } from 'zod'
import { artifactAttestationStatementSchema } from '../schemas/contracts'
import { base64ToBytes, bytesToBase64Url, canonicalJson } from './encoding'
import { ARTIFACT_POLICY_VERSION } from './state'

export interface ArtifactSigner {
  sign: (input: { resolutionId: string, artifactId: string }) => Promise<z.infer<typeof attestationSignatureSchema>>
}

const signerResponseSchema = z.object({
  algorithm: z.literal('Ed25519'),
  keyId: z.string().min(1).max(100),
  value: z.string().min(86).max(88).regex(/^[\w-]+$/),
}).strict()
const MAX_SIGNER_RESPONSE_BYTES = 8192
const ATTESTATION_SIGNATURE_DOMAIN = new TextEncoder().encode('skilld-attestation-v1\0')

export function createAttestationStatement(input: {
  artifactId: string
  createdAt: string
  source: ResolvedSource
  contentSha256: string
  contentBytes: number
  files: ArtifactFile[]
  checkResults: CheckResult[]
  linkedFiles?: LinkedArtifactFile[]
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
    // An empty list is left out, so the statement stays one every skilld CLI reads.
    ...(input.linkedFiles && input.linkedFiles.length > 0 ? { linkedFiles: input.linkedFiles } : {}),
  }
}

export function encodeAttestationStatement(statement: ArtifactAttestationStatement): string {
  return canonicalJson(statement)
}

export function completeAttestation(
  rawStatement: string,
  signature: z.infer<typeof attestationSignatureSchema>,
): ArtifactAttestation {
  const statementBytes = new TextEncoder().encode(rawStatement)
  const statement = artifactAttestationStatementSchema.parse(JSON.parse(rawStatement))
  return {
    ...statement,
    statement: bytesToBase64Url(statementBytes),
    signature,
  }
}

export async function createAttestationSignaturePayload(statementBytes: Uint8Array): Promise<Uint8Array> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(statementBytes).buffer))
  const payload = new Uint8Array(ATTESTATION_SIGNATURE_DOMAIN.byteLength + digest.byteLength)
  payload.set(ATTESTATION_SIGNATURE_DOMAIN)
  payload.set(digest, ATTESTATION_SIGNATURE_DOMAIN.byteLength)
  return payload
}

export async function verifyAttestationSignature(
  statementBytes: Uint8Array,
  signature: z.infer<typeof attestationSignatureSchema>,
  trustedRoot: TrustedRoot,
  now: number,
): Promise<boolean> {
  const trustedKey = trustedRoot.keys.find(key => key.keyId === signature.keyId)
  if (!trustedKey || trustedKey.status === 'retired' || trustedKey.status === 'revoked')
    return false
  if (now < Date.parse(trustedKey.notBefore) / 1000 || now >= Date.parse(trustedKey.notAfter) / 1000)
    return false
  const publicKeyBytes = decodeCanonicalBase64Url(trustedKey.publicKey)
  const signatureBytes = decodeCanonicalBase64Url(signature.value)
  if (!publicKeyBytes || !signatureBytes)
    return false
  const imported = await crypto.subtle.importKey(
    'raw',
    Uint8Array.from(publicKeyBytes).buffer,
    'Ed25519',
    false,
    ['verify'],
  ).then(key => ({ _tag: 'imported' as const, key })).catch(() => ({ _tag: 'invalid' as const }))
  if (imported._tag === 'invalid')
    return false
  const verified = await crypto.subtle.verify(
    'Ed25519',
    imported.key,
    Uint8Array.from(signatureBytes).buffer,
    Uint8Array.from(await createAttestationSignaturePayload(statementBytes)).buffer,
  ).then(valid => ({ _tag: 'verified' as const, valid })).catch(() => ({ _tag: 'invalid' as const }))
  return verified._tag === 'verified' && verified.valid
}

export async function verifyArtifactAttestation(
  attestation: ArtifactAttestation,
  trustedRoot: TrustedRoot,
  now: number,
): Promise<boolean> {
  const statementBytes = decodeCanonicalBase64Url(attestation.statement)
  if (!statementBytes)
    return false

  const rawStatement = decodeUtf8(statementBytes)
  if (rawStatement === null)
    return false
  const statementValue = parseJson(rawStatement)
  const parsed = artifactAttestationStatementSchema.safeParse(statementValue)
  if (!parsed.success)
    return false

  const { statement: _statement, signature, ...outerStatement } = attestation
  if (canonicalJson(parsed.data) !== canonicalJson(outerStatement))
    return false
  return await verifyAttestationSignature(statementBytes, signature, trustedRoot, now)
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

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  }
  catch {
    return undefined
  }
}

function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)
  }
  catch {
    return null
  }
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
