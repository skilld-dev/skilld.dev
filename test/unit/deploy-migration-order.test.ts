import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('production deployment order', () => {
  it('builds, migrates D1, then deploys the Worker', () => {
    const workflow = readFileSync(
      resolve(process.cwd(), '.github/workflows/deploy-cloudflare.yml'),
      'utf8',
    )
    const build = workflow.indexOf('- name: Build')
    const migrate = workflow.indexOf('- name: Apply D1 migrations')
    const deploy = workflow.indexOf('- name: Deploy')

    expect(build).toBeGreaterThan(-1)
    expect(migrate).toBeGreaterThan(build)
    expect(deploy).toBeGreaterThan(migrate)
    expect(workflow).toContain('run: pnpm db:migrations:prod')
  })
})
