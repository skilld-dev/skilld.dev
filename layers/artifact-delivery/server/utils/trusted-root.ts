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
