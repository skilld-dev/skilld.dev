import type { ArtifactAttestationStatement, CheckResult } from '../../../layers/artifact-delivery/server/schemas/contracts'
import { z } from 'zod'
import {
  artifactAttestationStatementSchema,
  artifactIdSchema,
  checkResultSchema,
  resolutionIdSchema,
  SHA256_PATTERN,
} from '../../../layers/artifact-delivery/server/schemas/contracts'
import { artifactR2Key } from '../../../layers/artifact-delivery/server/utils/artifact-storage'
import { createAttestationSignaturePayload, encodeAttestationStatement } from '../../../layers/artifact-delivery/server/utils/attestation'
import { checksPermitSigning, SIGNABLE_ARTIFACT_POLICIES } from '../../../layers/artifact-delivery/server/utils/checks'
import { base64ToBytes, bytesToBase64Url, canonicalJson, digestHex } from '../../../layers/artifact-delivery/server/utils/encoding'
import { ARTIFACT_POLICY_VERSION } from '../../../layers/artifact-delivery/server/utils/state'

type ArtifactSignerBindingName
  = 'ARTIFACT_SIGNING_KEY_ID'
    | 'ARTIFACT_SIGNING_KEY_NOT_AFTER'
    | 'ARTIFACT_SIGNING_KEY_NOT_BEFORE'
    | 'ARTIFACT_SIGNING_MAX_AGE_SECONDS'
    | 'ARTIFACT_SIGNING_PRIVATE_KEY_PKCS8'
    | 'DB'
    | 'PRIVATE_ARTIFACTS'
    | 'PUBLIC_ARTIFACTS'

export type ArtifactSignerBindings = Pick<ArtifactSignerEnv, ArtifactSignerBindingName>

export const ARTIFACT_SIGNER_MAX_REQUEST_BYTES = 512
const MAX_ATTESTATION_STATEMENT_BYTES = 6_291_456
const MAX_ARTIFACT_BYTES = 10 * 1024 * 1024

const signerRequestSchema = z.object({
  resolutionId: resolutionIdSchema,
  artifactId: artifactIdSchema,
}).strict()

const signerConfigSchema = z.object({
  keyId: z.string().min(1).max(100),
  notBefore: z.string().datetime(),
  notAfter: z.string().datetime(),
  maximumAgeSeconds: z.string().regex(/^[1-9]\d{0,3}$/).transform(Number).pipe(z.number().int().min(1).max(3600)),
  privateKey: z.string().min(2).max(512).regex(/^[\w-]+$/),
}).strict()

const signingRowSchema = z.object({
  id: resolutionIdSchema,
  state: z.string(),
  state_version: z.number().int().nonnegative(),
  repository_id: z.number().int().positive().safe(),
  resolved_owner: z.string().min(1),
  resolved_repository: z.string().min(1),
  commit_sha: z.string().length(40).regex(/^[a-f0-9]+$/),
  tree_sha: z.string().length(40).regex(/^[a-f0-9]+$/),
  skill_path: z.string().min(1).max(1024),
  artifact_id: artifactIdSchema,
  content_sha256: z.string().regex(SHA256_PATTERN),
  content_bytes: z.number().int().positive().max(MAX_ARTIFACT_BYTES),
  r2_key: z.string().min(1).max(1024),
  check_results_json: z.string().min(2).max(MAX_ATTESTATION_STATEMENT_BYTES),
  attestation_statement_json: z.string().min(2).max(MAX_ATTESTATION_STATEMENT_BYTES),
  created_at: z.number().int().nonnegative(),
  updated_at: z.number().int().nonnegative(),
  visibility: z.enum(['public', 'private']),
  account_id: z.number().int().positive().nullable(),
  ciphertext_sha256: z.string().regex(SHA256_PATTERN).nullable(),
  ciphertext_bytes: z.number().int().positive().nullable(),
  encryption_key_id: z.string().min(1).max(100).nullable(),
}).strict()

type SigningRow = z.infer<typeof signingRowSchema>

type SignerCode
  = 'ARTIFACT_BYTES_MISMATCH'
    | 'ARTIFACT_ID_MISMATCH'
    | 'CHECK_RESULTS_STALE'
    | 'CHECKS_BLOCKED'
    | 'INTERNAL_ERROR'
    | 'INVALID_REQUEST'
    | 'POLICY_OUTDATED'
    | 'REQUEST_TOO_LARGE'
    | 'RESOLUTION_NOT_FOUND'
    | 'RESOLUTION_NOT_SIGNABLE'
    | 'SIGNING_KEY_INVALID'
    | 'SIGNING_KEY_NOT_ACTIVE'
    | 'STATE_CHANGED'
    | 'STATEMENT_CHANGED'

interface SignerFailure {
  _tag: 'failure'
  code: SignerCode
  status: number
}

type ValidationResult
  = { _tag: 'valid', statementBytes: Uint8Array }
    | SignerFailure

const failures = {
  artifactBytesMismatch: (): SignerFailure => failure('ARTIFACT_BYTES_MISMATCH', 409),
  artifactIdMismatch: (): SignerFailure => failure('ARTIFACT_ID_MISMATCH', 409),
  checkResultsStale: (): SignerFailure => failure('CHECK_RESULTS_STALE', 409),
  checksBlocked: (): SignerFailure => failure('CHECKS_BLOCKED', 409),
  invalidRequest: (): SignerFailure => failure('INVALID_REQUEST', 400),
  policyOutdated: (): SignerFailure => failure('POLICY_OUTDATED', 409),
  requestTooLarge: (): SignerFailure => failure('REQUEST_TOO_LARGE', 413),
  resolutionNotFound: (): SignerFailure => failure('RESOLUTION_NOT_FOUND', 404),
  resolutionNotSignable: (): SignerFailure => failure('RESOLUTION_NOT_SIGNABLE', 409),
  signingKeyInvalid: (): SignerFailure => failure('SIGNING_KEY_INVALID', 503),
  signingKeyNotActive: (): SignerFailure => failure('SIGNING_KEY_NOT_ACTIVE', 503),
  stateChanged: (): SignerFailure => failure('STATE_CHANGED', 409),
  statementChanged: (): SignerFailure => failure('STATEMENT_CHANGED', 409),
} as const

export async function handleArtifactSignerRequest(
  request: Request,
  env: ArtifactSignerBindings,
  now: () => number = () => Math.floor(Date.now() / 1000),
): Promise<Response> {
  return await routeArtifactSignerRequest(request, env, now).catch(() => {
    console.error(JSON.stringify({ operation: 'artifact-sign', outcome: 'error', code: 'INTERNAL_ERROR' }))
    return failureResponse(failure('INTERNAL_ERROR', 500))
  })
}

async function routeArtifactSignerRequest(
  request: Request,
  env: ArtifactSignerBindings,
  now: () => number,
): Promise<Response> {
  const url = new URL(request.url)
  if (url.pathname !== '/v1/attest')
    return new Response(null, { status: 404 })
  if (request.method !== 'POST')
    return new Response(null, { status: 405, headers: { allow: 'POST' } })
  if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json')
    return failureResponse(failures.invalidRequest())

  const requestBody = await readRequestBody(request)
  if (requestBody._tag === 'failure')
    return failureResponse(requestBody)
  const parsedRequest = signerRequestSchema.safeParse(parseJson(requestBody.value))
  if (!parsedRequest.success)
    return failureResponse(failures.invalidRequest())

  const parsedConfig = signerConfigSchema.safeParse({
    keyId: env.ARTIFACT_SIGNING_KEY_ID,
    notBefore: env.ARTIFACT_SIGNING_KEY_NOT_BEFORE,
    notAfter: env.ARTIFACT_SIGNING_KEY_NOT_AFTER,
    maximumAgeSeconds: env.ARTIFACT_SIGNING_MAX_AGE_SECONDS,
    privateKey: env.ARTIFACT_SIGNING_PRIVATE_KEY_PKCS8,
  })
  if (!parsedConfig.success)
    return failureResponse(failures.signingKeyInvalid())

  const timestamp = now()
  const keyNotBefore = Date.parse(parsedConfig.data.notBefore) / 1000
  const keyNotAfter = Date.parse(parsedConfig.data.notAfter) / 1000
  if (keyNotBefore >= keyNotAfter)
    return failureResponse(failures.signingKeyInvalid())
  if (timestamp < keyNotBefore || timestamp >= keyNotAfter)
    return failureResponse(failures.signingKeyNotActive())

  const initialRow = await loadSigningRow(env.DB, parsedRequest.data.resolutionId)
  if (!initialRow)
    return failureResponse(failures.resolutionNotFound())
  if (initialRow.state !== 'signing')
    return failureResponse(failures.resolutionNotSignable())
  if (initialRow.artifact_id !== parsedRequest.data.artifactId)
    return failureResponse(failures.artifactIdMismatch())

  const validated = validateSigningRow(initialRow, parsedConfig.data.maximumAgeSeconds, timestamp)
  if (validated._tag === 'failure')
    return failureResponse(validated)
  const objectMatches = initialRow.visibility === 'private'
    ? await verifyPrivateArtifactObject(env.PRIVATE_ARTIFACTS, initialRow)
    : await verifyArtifactObject(env.PUBLIC_ARTIFACTS, initialRow)
  if (!objectMatches)
    return failureResponse(failures.artifactBytesMismatch())

  const currentRow = await loadSigningRow(env.DB, parsedRequest.data.resolutionId)
  if (!currentRow || canonicalJson(currentRow) !== canonicalJson(initialRow))
    return failureResponse(failures.stateChanged())

  const privateKeyBytes = decodeCanonicalBase64Url(parsedConfig.data.privateKey)
  if (!privateKeyBytes || privateKeyBytes.byteLength > 256)
    return failureResponse(failures.signingKeyInvalid())
  const imported = await crypto.subtle.importKey(
    'pkcs8',
    Uint8Array.from(privateKeyBytes).buffer,
    'Ed25519',
    false,
    ['sign'],
  ).then(key => ({ _tag: 'imported' as const, key })).catch(() => ({ _tag: 'invalid' as const }))
  if (imported._tag === 'invalid')
    return failureResponse(failures.signingKeyInvalid())

  const payload = await createAttestationSignaturePayload(validated.statementBytes)
  const signature = await crypto.subtle.sign('Ed25519', imported.key, Uint8Array.from(payload).buffer)
  return jsonResponse({
    algorithm: 'Ed25519',
    keyId: parsedConfig.data.keyId,
    value: bytesToBase64Url(new Uint8Array(signature)),
  }, 200)
}

function validateSigningRow(row: SigningRow, maximumAgeSeconds: number, now: number): ValidationResult {
  if (
    row.artifact_id !== `sha256:${row.content_sha256}`
    || (row.visibility === 'public' && row.r2_key !== artifactR2Key(row.content_sha256))
    || (row.visibility === 'private' && !row.r2_key.endsWith(`/${row.id}.bin`))
  ) {
    return failures.artifactIdMismatch()
  }
  // Checks count under the policy the statement names, when the signer signs
  // it. An unknown policy counts under the current one and fails below.
  const stagedPolicy = artifactAttestationStatementSchema.safeParse(parseJson(row.attestation_statement_json))
  const policyVersion = stagedPolicy.success && SIGNABLE_ARTIFACT_POLICIES.has(stagedPolicy.data.policyVersion)
    ? stagedPolicy.data.policyVersion
    : ARTIFACT_POLICY_VERSION
  const checkResultsValue = parseJson(row.check_results_json)
  const checkResults = z.array(checkResultSchema).min(1).max(100).safeParse(checkResultsValue)
  if (!checkResults.success || !checksPermitSigning(checkResults.data, policyVersion))
    return failures.checksBlocked()
  const checkAge = now - row.updated_at
  if (checkAge < 0 || checkAge > maximumAgeSeconds)
    return failures.checkResultsStale()

  const statementBytes = new TextEncoder().encode(row.attestation_statement_json)
  if (statementBytes.byteLength > MAX_ATTESTATION_STATEMENT_BYTES)
    return failures.statementChanged()
  const statementValue = parseJson(row.attestation_statement_json)
  const statement = artifactAttestationStatementSchema.safeParse(statementValue)
  if (!statement.success)
    return failures.statementChanged()
  if (!SIGNABLE_ARTIFACT_POLICIES.has(statement.data.policyVersion))
    return failures.policyOutdated()
  if (row.attestation_statement_json !== encodeAttestationStatement(statement.data))
    return failures.statementChanged()
  if (!statementMatchesRow(statement.data, checkResults.data, row))
    return failures.statementChanged()
  return { _tag: 'valid', statementBytes }
}

function statementMatchesRow(
  statement: ArtifactAttestationStatement,
  checkResults: CheckResult[],
  row: SigningRow,
): boolean {
  return statement.artifactId === row.artifact_id
    && statement.contentSha256 === row.content_sha256
    && statement.contentBytes === row.content_bytes
    && statement.createdAt === new Date(row.created_at * 1000).toISOString()
    && canonicalJson(statement.checkResults) === canonicalJson(checkResults)
    && canonicalJson(statement.source) === canonicalJson({
      provider: 'github',
      repositoryId: row.repository_id,
      owner: row.resolved_owner,
      repository: row.resolved_repository,
      visibility: row.visibility,
      commitSha: row.commit_sha,
      treeSha: row.tree_sha,
      skillPath: row.skill_path,
    })
}

async function verifyArtifactObject(bucket: R2Bucket, row: SigningRow): Promise<boolean> {
  const object = await bucket.get(row.r2_key)
  if (!object || !('arrayBuffer' in object))
    return false
  if (
    object.size !== row.content_bytes
    || checksumHex(object.checksums.sha256) !== row.content_sha256
    || object.customMetadata?.contentSha256 !== row.content_sha256
    || object.customMetadata?.format !== 'skilld-tar-v1'
  ) {
    return false
  }
  const bytes = new Uint8Array(await object.arrayBuffer())
  return bytes.byteLength === row.content_bytes
    && await digestHex('SHA-256', bytes) === row.content_sha256
}

async function verifyPrivateArtifactObject(bucket: R2Bucket, row: SigningRow): Promise<boolean> {
  if (!row.account_id || !row.ciphertext_sha256 || !row.ciphertext_bytes || !row.encryption_key_id)
    return false
  const object = await bucket.get(row.r2_key)
  if (!object || !('arrayBuffer' in object))
    return false
  const accountIdHash = await digestHex('SHA-256', String(row.account_id))
  if (
    object.size !== row.ciphertext_bytes
    || checksumHex(object.checksums.sha256) !== row.ciphertext_sha256
    || object.customMetadata?.accountIdHash !== accountIdHash
    || object.customMetadata?.artifactId !== row.artifact_id
    || object.customMetadata?.ciphertextSha256 !== row.ciphertext_sha256
    || object.customMetadata?.contentSha256 !== row.content_sha256
    || object.customMetadata?.encryptionKeyId !== row.encryption_key_id
    || object.customMetadata?.format !== 'skilld-private-artifact-v1'
    || object.customMetadata?.resolutionId !== row.id
  ) {
    return false
  }
  const bytes = new Uint8Array(await object.arrayBuffer())
  return bytes.byteLength === row.ciphertext_bytes
    && await digestHex('SHA-256', bytes) === row.ciphertext_sha256
}

async function loadSigningRow(db: D1Database, resolutionId: string): Promise<SigningRow | null> {
  const value = await db.prepare(
    `SELECT id, state, state_version,
       repository_id, resolved_owner, resolved_repository, commit_sha, tree_sha, skill_path,
       artifact_id, content_sha256, content_bytes, r2_key,
       check_results_json, attestation_statement_json, created_at, updated_at,
       visibility, account_id, ciphertext_sha256, ciphertext_bytes, encryption_key_id
     FROM artifact_resolutions
     WHERE id = ?1
     LIMIT 1`,
  ).bind(resolutionId).first<Record<string, unknown>>()
  if (!value)
    return null
  return signingRowSchema.parse(value)
}

async function readRequestBody(request: Request): Promise<{ _tag: 'body', value: string } | SignerFailure> {
  const declaredLength = request.headers.get('content-length')
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > ARTIFACT_SIGNER_MAX_REQUEST_BYTES))
    return failures.requestTooLarge()
  if (!request.body)
    return failures.invalidRequest()

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const next = await reader.read()
    if (next.done)
      break
    size += next.value.byteLength
    if (size > ARTIFACT_SIGNER_MAX_REQUEST_BYTES) {
      await reader.cancel('request too large')
      return failures.requestTooLarge()
    }
    chunks.push(next.value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  const decoded = decodeUtf8(bytes)
  return decoded === null ? failures.invalidRequest() : { _tag: 'body', value: decoded }
}

function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)
  }
  catch {
    return null
  }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  }
  catch {
    return undefined
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

function checksumHex(value: ArrayBuffer | undefined): string | null {
  if (!value)
    return null
  return [...new Uint8Array(value)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

function failure(code: SignerCode, status: number): SignerFailure {
  return { _tag: 'failure', code, status }
}

function failureResponse(value: SignerFailure): Response {
  if (value.status >= 500)
    console.error(JSON.stringify({ operation: 'artifact-sign', outcome: 'rejected', code: value.code }))
  return jsonResponse({ code: value.code }, value.status)
}

function jsonResponse(value: unknown, status: number): Response {
  return Response.json(value, {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  })
}
