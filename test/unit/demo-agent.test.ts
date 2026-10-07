import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { runDemoAgent } from '../../scripts/lib/demo-agent'

describe('runDemoAgent', () => {
  it('closes stdin so an argument-based prompt can start', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'demo-agent-test-'))
    const fixture = fileURLToPath(new URL('../fixtures/demo-agent-stdin.ts', import.meta.url))
    const result = await runDemoAgent({ command: process.execPath, args: [fixture], cwd, env: process.env, timeout: 2000 })
      .finally(() => rm(cwd, { recursive: true }))
    expect(result.stdout).toBe('input closed')
  })
})
