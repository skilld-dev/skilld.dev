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
  return readTrustedRoots(value, now).flatMap(result => result._tag === 'valid' ? [result.root] : [])
}

type RootResult = { _tag: 'valid', root: TrustedRoot } | { _tag: 'invalid' }

function readTrustedRoots(value: string | undefined, now: number): RootResult[] {
  if (!value?.trim())
    return []
  const configs: unknown = JSON.parse(value)
  if (!Array.isArray(configs) || configs.length === 0)
    throw new Error('Served trusted roots must be a non-empty JSON array')
  const ids = configs.map((config: unknown) => {
    if (typeof config === 'object' && config !== null && 'rootKeyId' in config)
      return config.rootKeyId
    return undefined
  })
  return configs.map((config: unknown, index): RootResult => {
    try {
      if (ids[index] !== undefined && ids.indexOf(ids[index]) !== ids.lastIndexOf(ids[index]))
        throw new Error('Duplicate root ID')
      return { _tag: 'valid', root: parseTrustedRoot(JSON.stringify(config), now) }
    }
    catch {
      // Config can contain secrets or untrusted text. Report only its array position.
      console.error(`Rejected trusted root at array index ${index}: invalid or duplicate entry`)
      return { _tag: 'invalid' }
    }
  })
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
  const selected = readTrustedRoots(env.ARTIFACT_TRUSTED_ROOTS_JSON, now)[0]
  if (!selected)
    return parseTrustedRoot(env.ARTIFACT_TRUSTED_ROOT_JSON, now)
  if (selected._tag === 'invalid')
    throw new Error('The selected site trusted root is invalid')
  return selected.root
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
