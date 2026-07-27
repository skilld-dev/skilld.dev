import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/deploy-cloudflare.yml'),
  'utf8',
)

describe('production deployment order', () => {
  it('deploys only a successful main-branch Test workflow at its exact SHA', () => {
    expect(workflow).toContain('workflow_run:')
    expect(workflow).toContain('workflows: [Test]')
    expect(workflow).toContain(`github.event.workflow_run.conclusion == 'success'`)
    expect(workflow).toContain(`github.event.workflow_run.head_branch == 'main'`)
    expect(workflow).toContain('github.event.workflow_run.head_sha == github.sha')
    expect(workflow).toContain(`ref: \${{ github.event.workflow_run.head_sha || github.sha }}`)
    expect(workflow).not.toContain('branches: [main]')
  })

  it('serializes production deployments without interrupting an active deploy', () => {
    expect(workflow).toContain('group: production-deploy')
    expect(workflow).toContain('cancel-in-progress: false')
  })

  it('builds, migrates D1, then deploys the Worker', () => {
    const build = workflow.indexOf('- name: Build')
    const migrate = workflow.indexOf('- name: Apply D1 migrations')
    const deploy = workflow.indexOf('- name: Deploy')

    expect(build).toBeGreaterThan(-1)
    expect(migrate).toBeGreaterThan(build)
    expect(deploy).toBeGreaterThan(migrate)
    expect(workflow).toContain('run: pnpm db:migrations:prod')
  })

  it('runs the production smoke contract after deployment', () => {
    const deploy = workflow.indexOf('- name: Deploy')
    const smoke = workflow.indexOf('- name: Smoke production routes')

    expect(smoke).toBeGreaterThan(deploy)
    expect(workflow).toContain('run: pnpm production:smoke')
  })
})
