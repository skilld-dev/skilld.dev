import { trustedKeyStatementSchema, trustedRootConfigSchema, trustedRootSchema } from '../schemas/contracts'
import { base64ToBytes, bytesToBase64Url, canonicalJson } from './encoding'

export type TrustedRoot = ReturnType<typeof parseTrustedRoot>

export function parseTrustedRoot(value: string, now: number) {
  const config = trustedRootConfigSchema.parse(JSON.parse(value))
  for (const key of config.keys) {
    const statementBytes = decodeCanonicalBase64Url(key.statement)
    if (!statementBytes)
      throw new Error(`Trusted key ${key.keyId} statement is not canonical base64url`)
    const statement = decodeStatement(statementBytes)
    const { statement: _statement, rootSignature: _rootSignature, ...outer } = key
    const expected = { version: 1 as const, rootKeyId: config.rootKeyId, ...outer }
    if (canonicalJson(statement) !== canonicalJson(expected))
      throw new Error(`Trusted key ${key.keyId} statement does not match its fields`)
  }
  return trustedRootSchema.parse({
    ...config,
    fetchedAt: new Date(now * 1000).toISOString(),
  })
}

/**
 * The roots served at `/api/v1/trusted-roots/{rootKeyId}`, from a JSON array.
 * skilld CLI 3.7.0 and later fetch the root they pin by its id. Older CLIs pin
 * `skilld-root-2026`, whose key was lost, and read `/api/v1/trusted-root`.
 */
export function parseTrustedRoots(value: string | undefined, now: number): TrustedRoot[] {
  if (!value?.trim())
    return []
  const configs: unknown = JSON.parse(value)
  if (!Array.isArray(configs) || configs.length === 0)
    throw new Error('Served trusted roots must be a non-empty JSON array')
  const roots = configs.map(config => parseTrustedRoot(JSON.stringify(config), now))
  const seen = new Set<string>()
  for (const root of roots) {
    if (seen.has(root.rootKeyId))
      throw new Error(`Trusted root ${root.rootKeyId} is served twice`)
    seen.add(root.rootKeyId)
  }
  return roots
}

interface TrustedRootEnv {
  ARTIFACT_TRUSTED_ROOTS_JSON?: string
  ARTIFACT_TRUSTED_ROOT_JSON: string
}

/**
 * The root whose signing keys the site verifies attestations with: the first
 * served root, which lists every key the site accepts. Until roots are served,
 * the legacy root.
 */
export function siteTrustedRoot(env: TrustedRootEnv, now: number): TrustedRoot {
  return parseTrustedRoots(env.ARTIFACT_TRUSTED_ROOTS_JSON, now)[0] ?? parseTrustedRoot(env.ARTIFACT_TRUSTED_ROOT_JSON, now)
}

function decodeCanonicalBase64Url(value: string): Uint8Array | null {
  if (value.length % 4 === 1)
    return null
  const bytes = base64ToBytes(value)
  return bytesToBase64Url(bytes) === value ? bytes : null
}

function decodeStatement(bytes: Uint8Array) {
  const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)
  return trustedKeyStatementSchema.parse(JSON.parse(source))
}
