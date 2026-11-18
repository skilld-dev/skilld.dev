// The Artifact signing key ceremony. docs/runbooks/signing-key-rotation.md
// gives the order. No command prints a private key: each one reads or writes
// key files with mode 600.
import type { NewTrustedKey, RootPin, TrustedRootConfig } from './lib/trusted-root-ceremony'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import {
  addTrustedKey,
  createTrustedRoot,
  generateSigningKey,
  parseRootConfig,
  readPrivateKey,
  removeTrustedKey,
  signingKeyMatches,
  verifyTrustedRoot,
} from './lib/trusted-root-ceremony'

// The root that skilld CLI 3.7.0 and later pin first. Each root is served at
// its own path, so CLIs pinned to an older root keep reading theirs.
const LIVE_ROOT = 'https://skilld.dev/api/v1/trusted-roots/skilld-root-2026-11'

const USAGE = `Usage: pnpm exec tsx scripts/trusted-root.ts <command> [options]

  signing-key --key-id <id> --out <dir>
      Write <dir>/<id>.pkcs8 and <dir>/<id>.pub. Also makes a root key pair.
  create-root --root-key-id <id> --root-key <file> --key-id <id> --public-key-file <file>
          --not-before <iso> --not-after <iso> [--status active|overlapping] --out <file>
      Start a trusted root under a new root key, with its first signing key.
  add-key --root <file|url> --root-key <file> --key-id <id> --public-key-file <file>
          --not-before <iso> --not-after <iso> [--status active|overlapping] --out <file>
      Sign the key statement with the offline root key and write the new root.
  remove-key --root <file|url> --key-id <id> --out <file>
      Write the root without that key. Removal needs no root key.
  verify --root <file|url> [--pin <file|url>] [--key-id <id> --signing-key <file>]
      Check the root as every released skilld CLI does. --pin defaults to ${LIVE_ROOT}.
      With --signing-key, also check the private key matches that key ID.`

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    'key-id': { type: 'string' },
    'not-after': { type: 'string' },
    'not-before': { type: 'string' },
    'out': { type: 'string' },
    'pin': { type: 'string' },
    'public-key-file': { type: 'string' },
    'root': { type: 'string' },
    'root-key': { type: 'string' },
    'root-key-id': { type: 'string' },
    'signing-key': { type: 'string' },
    'status': { type: 'string' },
  },
})

function required(name: keyof typeof values): string {
  const value = values[name]
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`Missing --${name}.\n\n${USAGE}`)
  return value
}

async function readRoot(source: string): Promise<TrustedRootConfig> {
  if (/^https?:\/\//.test(source)) {
    const response = await fetch(source, { headers: { accept: 'application/json' } })
    if (!response.ok)
      throw new Error(`${source} answered HTTP ${response.status}.`)
    return parseRootConfig(await response.json())
  }
  return parseRootConfig(JSON.parse(readFileSync(source, 'utf8')))
}

/** Writes a new file only. A key or root file is never overwritten. */
function writeNew(path: string, value: string, mode: number): void {
  if (existsSync(path))
    throw new Error(`${path} exists. Choose another path.`)
  writeFileSync(path, value, { mode, flag: 'wx' })
}

function newKeyFromArgs(): NewTrustedKey {
  const status = values.status ?? 'active'
  if (status !== 'active' && status !== 'overlapping')
    throw new Error('--status must be active or overlapping.')
  return {
    keyId: required('key-id'),
    publicKey: readFileSync(required('public-key-file'), 'utf8').trim(),
    notBefore: required('not-before'),
    notAfter: required('not-after'),
    status,
  }
}

function printKeys(root: TrustedRootConfig): void {
  const now = Date.now()
  for (const key of root.keys) {
    const open = Date.parse(key.notBefore) <= now && now < Date.parse(key.notAfter)
    console.log(`  ${key.keyId}  ${key.status}  ${key.notBefore} to ${key.notAfter}  ${open ? 'open now' : 'closed now'}`)
  }
}

async function main(command: string | undefined): Promise<void> {
  switch (command) {
    case 'signing-key': {
      const keyId = required('key-id')
      const out = required('out')
      const key = generateSigningKey()
      writeNew(join(out, `${keyId}.pkcs8`), key.privateKeyPkcs8, 0o600)
      writeNew(join(out, `${keyId}.pub`), key.publicKey, 0o644)
      console.log(`Wrote ${join(out, `${keyId}.pkcs8`)} (private, mode 600) and ${join(out, `${keyId}.pub`)}.`)
      return
    }
    case 'create-root': {
      const next = createTrustedRoot(required('root-key-id'), readPrivateKey(readFileSync(required('root-key'), 'utf8')), newKeyFromArgs())
      writeNew(required('out'), JSON.stringify(next), 0o600)
      console.log(`Wrote ${required('out')} for root ${next.rootKeyId}:`)
      printKeys(next)
      return
    }
    case 'add-key': {
      const root = await readRoot(required('root'))
      const next = addTrustedKey(root, readPrivateKey(readFileSync(required('root-key'), 'utf8')), newKeyFromArgs())
      writeNew(required('out'), JSON.stringify(next), 0o600)
      console.log(`Wrote ${required('out')}:`)
      printKeys(next)
      return
    }
    case 'remove-key': {
      const next = removeTrustedKey(await readRoot(required('root')), required('key-id'))
      writeNew(required('out'), JSON.stringify(next), 0o600)
      console.log(`Wrote ${required('out')}:`)
      printKeys(next)
      return
    }
    case 'verify': {
      const root = await readRoot(required('root'))
      const pinRoot = await readRoot(values.pin ?? LIVE_ROOT)
      const pin: RootPin = { rootKeyId: pinRoot.rootKeyId, rootPublicKey: pinRoot.rootPublicKey }
      const result = verifyTrustedRoot(root, pin, Math.floor(Date.now() / 1000))
      const problems = result._tag === 'invalid' ? [...result.problems] : []
      if (values['signing-key']) {
        const keyId = required('key-id')
        const privateKey = readPrivateKey(readFileSync(values['signing-key'], 'utf8'))
        if (!signingKeyMatches(root, keyId, privateKey))
          problems.push(`${keyId}: the signing key file does not match the public key the root lists for that key ID.`)
      }
      console.log(`Root ${root.rootKeyId}, ${root.keys.length} signing keys:`)
      printKeys(root)
      if (problems.length > 0) {
        console.error(`FAILED:\n${problems.map(problem => `  - ${problem}`).join('\n')}`)
        process.exitCode = 1
        return
      }
      console.log('OK: the CLI pin, every statement, and every root signature verify.')
      return
    }
    default:
      throw new Error(USAGE)
  }
}

main(positionals[0]).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
