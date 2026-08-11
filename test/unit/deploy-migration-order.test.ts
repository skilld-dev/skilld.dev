import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/deploy-cloudflare.yml'),
  'utf8',
)
const testWorkflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/test.yml'),
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

  it('supersedes stale production deployments in one static target group', () => {
    expect(workflow).toContain('group: deploy-cloudflare-production')
    expect(workflow).toContain('cancel-in-progress: true')
  })

  it('builds, migrates D1, then runs the guarded production deployment', () => {
    const build = workflow.indexOf('- name: Build')
    const migrate = workflow.indexOf('- name: Apply D1 migrations')
    const deploy = workflow.indexOf('- name: Deploy, smoke, and rollback on failure')

    expect(build).toBeGreaterThan(-1)
    expect(migrate).toBeGreaterThan(build)
    expect(deploy).toBeGreaterThan(migrate)
    expect(workflow).toContain('run: pnpm db:migrations:prod')
    expect(workflow).toContain('run: pnpm production:deploy')
  })

  it('delegates deploy, smoke, and explicit rollback to one guarded command', () => {
    expect(workflow).not.toContain('run: npx wrangler --cwd .output deploy')
    expect(workflow).not.toContain('- name: Smoke production routes')
    expect(workflow).toContain('GITHUB_SHA:')
    expect(workflow).toContain('CLOUDFLARE_API_TOKEN:')
    expect(workflow).toContain('CLOUDFLARE_ACCOUNT_ID:')
  })

  it('uses bounded, frozen, read-only CI and cancels stale branch runs', () => {
    expect(testWorkflow).toContain('permissions:\n  contents: read')
    expect(testWorkflow).toContain(`group: test-\${{ github.ref }}`)
    expect(testWorkflow).toContain('cancel-in-progress: true')
    expect(testWorkflow.match(/timeout-minutes:/g)).toHaveLength(3)
    expect(testWorkflow).toContain('pnpm install --frozen-lockfile')
  })
})
