import { spawnSync } from 'node:child_process'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { createTrustedRoot, generateSigningKey } from '../../scripts/lib/trusted-root-ceremony'

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

// Execute the workflow's configuration commands. Only the Cloudflare write
// boundary is replaced; the ceremony verifies real root signatures and keys.
function stage(options: { mismatch?: boolean, enabledSlot?: boolean, stageSecondary?: boolean, publishRoots?: boolean } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'signing-config-'))
  directories.push(directory)
  const signing = generateSigningKey()
  const key = {
    keyId: 'rotation-test',
    publicKey: signing.publicKey,
    notBefore: '2026-11-18T00:00:00.000Z',
    notAfter: '2027-05-20T00:00:00.000Z',
    status: 'active' as const,
  }
  const primary = createTrustedRoot('primary', generateKeyPairSync('ed25519').privateKey, key)
  const backup = createTrustedRoot('backup', generateKeyPairSync('ed25519').privateKey, key)
  const calls = join(directory, 'calls.jsonl')
  const realPnpm = spawnSync('which', ['pnpm'], { encoding: 'utf8' }).stdout.trim()
  writeFileSync(join(directory, 'pnpm'), `#!/usr/bin/env node
import { readFileSync, appendFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const args = process.argv.slice(2)
if (args.includes('wrangler')) {
  const name = args[args.indexOf('put') + 1]
  const input = readFileSync(0, 'utf8')
  const expected = name === 'ARTIFACT_TRUSTED_ROOTS_JSON' ? process.env.ARTIFACT_ROTATION_ROOTS_JSON : process.env.ARTIFACT_ROTATION_SECONDARY_PKCS8
  appendFileSync(process.env.TEST_CALLS, JSON.stringify({ args, matches: input.trim() === expected.trim() }) + '\\n')
} else {
  const result = spawnSync(process.env.TEST_PNPM, args, { stdio: 'inherit' })
  process.exit(result.status ?? 1)
}
`, { mode: 0o700 })
  const config = join(directory, 'signer.json')
  writeFileSync(config, JSON.stringify({ vars: options.enabledSlot ? { ARTIFACT_SIGNING_SECONDARY_KEY_ID: 'already-enabled' } : {} }))
  const workflow = parse(readFileSync(resolve('.github/workflows/deploy-cloudflare.yml'), 'utf8'))
  const steps = workflow.jobs.deploy.steps as { run?: string, if?: string, env?: Record<string, string> }[]
  const context = {
    github: { event_name: 'workflow_dispatch' },
    inputs: { publish_artifact_roots: options.publishRoots ?? true, stage_artifact_secondary: options.stageSecondary ?? true },
    secrets: {
      ARTIFACT_ROTATION_ROOTS_JSON: JSON.stringify([primary, backup]),
      ARTIFACT_ROTATION_PRIMARY_PIN_JSON: JSON.stringify(primary),
      ARTIFACT_ROTATION_BACKUP_PIN_JSON: JSON.stringify(backup),
      ARTIFACT_ROTATION_SECONDARY_PKCS8: options.mismatch ? generateSigningKey().privateKeyPkcs8 : signing.privateKeyPkcs8,
    },
    vars: { ARTIFACT_ROTATION_KEY_ID: key.keyId },
  }
  const selected = steps.filter(step => step.env?.PUBLISH_ARTIFACT_ROOTS !== undefined
    && (!step.if || runInNewContext(step.if, context, { timeout: 100 })))
  const commands = selected.map(step => step.run).join('\n')
  const environment = Object.fromEntries(selected.flatMap(step => Object.entries(step.env ?? {}).map(([name, value]) => {
    const expression = value.startsWith('${{') && value.endsWith('}}') ? value.slice(3, -2).trim() : null
    return [name, expression ? String(runInNewContext(expression, context, { timeout: 100 }) ?? '') : value]
  })))
  const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', commands], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      ...environment,
      PATH: `${directory}:${process.env.PATH}`,
      RUNNER_TEMP: directory,
      GITHUB_STEP_SUMMARY: join(directory, 'summary.md'),
      TEST_CALLS: calls,
      TEST_PNPM: realPnpm,
      ARTIFACT_SIGNER_CONFIG: config,
    },
  })
  // Never include captured output or key material in an assertion failure.
  const writes: { args: string[], matches: boolean }[] = readFileSyncIfPresent(calls)
  return { status: result.status, writes }
}

function readFileSyncIfPresent(path: string) {
  try {
    return readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return []
    throw error
  }
}

describe('production signing configuration', () => {
  it('publishes verified roots and stages the secondary secret before enabling its slot', () => {
    const result = stage()
    expect(result.status).toBe(0)
    expect(result.writes).toEqual([
      { args: ['exec', 'wrangler', 'secret', 'put', 'ARTIFACT_TRUSTED_ROOTS_JSON', '--config', 'wrangler.jsonc'], matches: true },
      { args: ['--filter', '@skilld/artifact-signer-worker', 'exec', 'wrangler', 'secret', 'put', 'ARTIFACT_SIGNING_SECONDARY_PRIVATE_KEY_PKCS8', '--config', 'wrangler.jsonc'], matches: true },
    ])
  })

  it('rejects a mismatched signing key before either production write', () => {
    const result = stage({ mismatch: true })
    expect(result.status).not.toBe(0)
    expect(result.writes).toEqual([])
  })

  it('refuses to overwrite the secret of an enabled slot', () => {
    const result = stage({ enabledSlot: true })
    expect(result.status).not.toBe(0)
    expect(result.writes).toEqual([])
  })

  it('publishes roots after activation without replacing the enabled signer secret', () => {
    const result = stage({ enabledSlot: true, stageSecondary: false })
    expect(result.status).toBe(0)
    expect(result.writes).toEqual([
      { args: ['exec', 'wrangler', 'secret', 'put', 'ARTIFACT_TRUSTED_ROOTS_JSON', '--config', 'wrangler.jsonc'], matches: true },
    ])
  })

  it('leaves production configuration alone when both dispatch inputs are false', () => {
    const result = stage({ publishRoots: false, stageSecondary: false })
    expect(result.status).toBe(0)
    expect(result.writes).toEqual([])
  })
})
