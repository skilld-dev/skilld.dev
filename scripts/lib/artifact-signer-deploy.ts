import type { ProductionCommand } from './production-deploy'
import type { TrustedRootConfig } from './trusted-root-ceremony'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ARTIFACT_SIGNING_KEY_SLOTS } from '../../workers/artifact-signer/src/slots'
import { readPrivateKey, signingKeyMatches, verifyTrustedRoot } from './trusted-root-ceremony'

export async function deployArtifactSigner(input: {
  vars: Record<string, unknown>
  secrets: Record<string, string | undefined>
  root: TrustedRootConfig
  now: number
  command: ProductionCommand
}) {
  // Check the incoming key, even before its window opens, and any other
  // supplied keys. Older Worker secrets may have no offline copy left.
  // Upload these exact values with the version. A name-only secret listing
  // cannot prove that the staged Worker secret matches the trusted root.
  const secrets = checkedSecrets(input)
  if (!secrets)
    throw new Error('Signing key preflight failed. Check the configured keys, windows, and Actions secrets against the live trusted root.')

  const scratch = join(homedir(), 'scratch')
  await mkdir(scratch, { recursive: true })
  const directory = await mkdtemp(join(scratch, 'artifact-signer-'))
  const file = join(directory, 'secrets.json')
  try {
    await writeFile(file, JSON.stringify(secrets), { mode: 0o600, flag: 'wx' })
    return await input.command(['deploy', '--config', 'wrangler.jsonc', '--secrets-file', file])
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function checkedSecrets(input: {
  vars: Record<string, unknown>
  secrets: Record<string, string | undefined>
  root: TrustedRootConfig
  now: number
}): Record<string, string> | null {
  const { root } = input
  if (verifyTrustedRoot(root, root, input.now)._tag !== 'valid')
    return null
  const secrets: Record<string, string> = {}
  const seen = new Set<string>()
  let newest: { start: number, end: number, secretName: string } | undefined
  for (const names of Object.values(ARTIFACT_SIGNING_KEY_SLOTS)) {
    const keyId = input.vars[names.keyId]
    const before = input.vars[names.notBefore]
    const after = input.vars[names.notAfter]
    if (keyId === undefined && before === undefined && after === undefined)
      continue
    if (typeof keyId !== 'string' || typeof before !== 'string' || typeof after !== 'string' || seen.has(keyId))
      return null
    seen.add(keyId)
    const trusted = root.keys.find(key => key.keyId === keyId)
    if (!trusted || (trusted.status !== 'active' && trusted.status !== 'overlapping'))
      return null
    const start = Date.parse(before)
    const end = Date.parse(after)
    if (!(start < end && start >= Date.parse(trusted.notBefore) && end <= Date.parse(trusted.notAfter)))
      return null
    if (!newest || start > newest.start || (start === newest.start && end > newest.end))
      newest = { start, end, secretName: names.privateKey }
    const secret = input.secrets[names.privateKey]
    if (!secret)
      continue
    // Invalid key material is an expected preflight failure. Never include
    // parser diagnostics or secret input in the error returned to Actions.
    try {
      const privateKey = readPrivateKey(secret)
      if (!signingKeyMatches(root, keyId, privateKey))
        return null
      secrets[names.privateKey] = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64url')
    }
    catch {
      return null
    }
  }
  return newest && secrets[newest.secretName] ? secrets : null
}
