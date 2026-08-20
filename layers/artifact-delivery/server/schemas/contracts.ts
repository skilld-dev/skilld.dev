import { z } from 'zod'

export const SHA256_PATTERN = /^[a-f0-9]{64}$/
export const COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/
export const ARTIFACT_ID_PATTERN = /^sha256:[a-f0-9]{64}$/

const githubOwnerSchema = z.string().min(1).max(39).regex(/^[a-z0-9][a-z0-9-]{0,38}$/i)
const githubRepositorySchema = z.string().min(1).max(100).regex(/^[\w.-]+$/).refine(value => value !== '.' && value !== '..' && !value.endsWith('.git'))

export const sourceSelectorSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('path'), path: z.string().min(1).max(1024) }).strict(),
  z.object({ type: z.literal('named-skill'), name: z.string().max(64).regex(/^[a-z0-9](?:[a-z0-9]|-(?!-)){0,62}[a-z0-9]$|^[a-z0-9]$/) }).strict(),
])

export const sourceRefSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('branch'), value: z.string().min(1).max(255) }).strict(),
  z.object({ type: z.literal('tag'), value: z.string().min(1).max(255) }).strict(),
  z.object({ type: z.literal('commit'), value: z.string().regex(COMMIT_SHA_PATTERN) }).strict(),
])

export const sourceRequestSchema = z.object({
  provider: z.literal('github'),
  owner: githubOwnerSchema,
  repository: githubRepositorySchema,
  selector: sourceSelectorSchema,
  ref: sourceRefSchema.optional(),
}).strict()

export const createResolutionRequestSchema = z.object({
  source: sourceRequestSchema,
}).strict()

export const resolutionIdSchema = z.string().uuid()
export const artifactIdSchema = z.string().regex(ARTIFACT_ID_PATTERN)

export const resolvedSourceSchema = z.object({
  provider: z.literal('github'),
  repositoryId: z.number().int().positive().safe(),
  owner: z.string().min(1),
  repository: z.string().min(1),
  visibility: z.literal('public'),
  commitSha: z.string().regex(COMMIT_SHA_PATTERN),
  treeSha: z.string().regex(COMMIT_SHA_PATTERN),
  skillPath: z.string().min(1).max(1024),
}).strict()

export const checkResultSchema = z.object({
  name: z.string().min(1).max(100),
  version: z.string().min(1).max(50),
  outcome: z.enum(['pass', 'warn', 'fail', 'error']),
  required: z.boolean(),
  summary: z.string().max(500).optional(),
  findings: z.array(z.string().max(500)).max(100).optional(),
}).strict()

export const artifactFileSchema = z.object({
  path: z.string().min(1).max(1024),
  mode: z.union([z.literal(420), z.literal(493)]),
  size: z.number().int().nonnegative(),
  sha256: z.string().regex(SHA256_PATTERN),
}).strict()

export const attestationSignatureSchema = z.object({
  algorithm: z.literal('Ed25519'),
  keyId: z.string().min(1).max(100),
  value: z.string().min(86).max(88).regex(/^[\w-]+$/),
}).strict()

export const artifactAttestationStatementSchema = z.object({
  version: z.literal(1),
  artifactId: artifactIdSchema,
  createdAt: z.string().datetime(),
  source: resolvedSourceSchema,
  sourceStatus: z.literal('verified'),
  format: z.literal('skilld-tar-v1'),
  contentSha256: z.string().regex(SHA256_PATTERN),
  contentBytes: z.number().int().positive(),
  policyVersion: z.string().min(1).max(100),
  files: z.array(artifactFileSchema).min(1).max(2000),
  checkResults: z.array(checkResultSchema).min(1).max(100),
}).strict()

export const artifactAttestationSchema = artifactAttestationStatementSchema.extend({
  statement: z.string().min(2).max(8_388_608).regex(/^[\w-]+$/),
  signature: attestationSignatureSchema,
}).strict()

export const artifactDescriptorSchema = z.object({
  artifactId: artifactIdSchema,
  visibility: z.literal('public'),
  attestation: artifactAttestationSchema,
}).strict()

export const resolutionPendingSchema = z.object({
  state: z.literal('pending'),
  resolutionId: resolutionIdSchema,
  stage: z.enum(['requested', 'resolving', 'fetching', 'checking', 'packaging', 'signing', 'publishing', 'retry-wait']),
  pollAfterMs: z.number().int().min(250).max(60_000),
}).strict()

export const resolutionReadySchema = z.object({
  state: z.literal('ready'),
  resolutionId: resolutionIdSchema,
  artifact: artifactDescriptorSchema,
}).strict()

export const resolutionBlockedSchema = z.object({
  state: z.literal('blocked'),
  resolutionId: resolutionIdSchema,
  checkResults: z.array(checkResultSchema).min(1),
}).strict()

export const problemCodeSchema = z.enum([
  'AUTH_REQUIRED',
  'INVALID_SOURCE',
  'SOURCE_NOT_FOUND',
  'SOURCE_ACCESS_DENIED',
  'SOURCE_UNAVAILABLE',
  'RATE_LIMITED',
  'CHECK_BLOCKED',
  'CHECK_UNAVAILABLE',
  'ARTIFACT_REVOKED',
  'ARTIFACT_EXPIRED',
  'ATTESTATION_EXPIRED',
  'SIGNER_UNAVAILABLE',
  'SERVICE_UNAVAILABLE',
])

export const problemSchema = z.object({
  type: z.string().url(),
  title: z.string().max(200),
  status: z.number().int().min(400).max(599),
  detail: z.string().max(1000).optional(),
  instance: z.string().min(1).optional(),
  code: problemCodeSchema,
}).strict()

export const resolutionFailedSchema = z.object({
  state: z.literal('failed'),
  resolutionId: resolutionIdSchema,
  code: problemCodeSchema,
  retryable: z.boolean(),
}).strict()

export const resolutionRevokedSchema = z.object({
  state: z.literal('revoked'),
  resolutionId: resolutionIdSchema,
  reasonCode: z.string().min(1).max(100),
}).strict()

export const resolutionSchema = z.discriminatedUnion('state', [
  resolutionPendingSchema,
  resolutionReadySchema,
  resolutionBlockedSchema,
  resolutionFailedSchema,
  resolutionRevokedSchema,
])

export const createResolutionResponseSchema = z.discriminatedUnion('state', [
  resolutionPendingSchema,
  resolutionReadySchema,
])

export const publicArtifactGrantSchema = z.object({
  kind: z.literal('public'),
  artifactId: artifactIdSchema,
  contentUrl: z.string().url(),
  expiresAt: z.string().datetime(),
  attestation: artifactAttestationSchema,
}).strict()

export const trustedKeySchema = z.object({
  keyId: z.string().min(1).max(100),
  algorithm: z.literal('Ed25519'),
  publicKey: z.string().min(43).max(44).regex(/^[\w-]+$/),
  notBefore: z.string().datetime(),
  notAfter: z.string().datetime(),
  status: z.enum(['active', 'overlapping', 'retired', 'revoked']),
  rootSignature: z.string().min(86).max(88).regex(/^[\w-]+$/).optional(),
}).strict()

export const trustedRootConfigSchema = z.object({
  version: z.literal(1),
  rootKeyId: z.string().min(1).max(100),
  rootPublicKey: z.string().min(43).max(44).regex(/^[\w-]+$/),
  keys: z.array(trustedKeySchema).min(1),
}).strict()

export const trustedRootSchema = trustedRootConfigSchema.extend({
  fetchedAt: z.string().datetime(),
}).strict()

export type SourceRequest = z.infer<typeof sourceRequestSchema>
export type ResolvedSource = z.infer<typeof resolvedSourceSchema>
export type CheckResult = z.infer<typeof checkResultSchema>
export type ArtifactFile = z.infer<typeof artifactFileSchema>
export type ArtifactAttestationStatement = z.infer<typeof artifactAttestationStatementSchema>
export type ArtifactAttestation = z.infer<typeof artifactAttestationSchema>
export type ResolutionResponse = z.infer<typeof resolutionSchema>
export type ProblemCode = z.infer<typeof problemCodeSchema>
export type ArtifactProblem = z.infer<typeof problemSchema>
