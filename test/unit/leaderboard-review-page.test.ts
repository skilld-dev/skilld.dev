import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const pageSource = readFileSync(
  resolve(root, 'layers/admin/app/pages/admin/leaderboard-repositories.vue'),
  'utf8',
)
const layoutSource = readFileSync(
  resolve(root, 'layers/admin/app/layouts/admin.vue'),
  'utf8',
)
const appSource = readFileSync(resolve(root, 'app/app.vue'), 'utf8')
const reviewJobSource = readFileSync(
  resolve(root, 'server/jobs/registry/review-repo-sync.ts'),
  'utf8',
)
const nuxtConfig = readFileSync(resolve(root, 'nuxt.config.ts'), 'utf8')
const wranglerConfig = readFileSync(resolve(root, 'wrangler.jsonc'), 'utf8')

describe('leaderboard repository review page contract', () => {
  it('exposes truthful review language and explicit async states', () => {
    expect(pageSource).toContain('Repository reviews')
    expect(pageSource).toContain('status === \'pending\'')
    expect(pageSource).toContain('v-else-if="error"')
    expect(pageSource).toContain('No repositories waiting for review')
    expect(pageSource).toContain('Retry queue')
    expect(pageSource).toContain('Individual GitHub user')
    expect(pageSource).toContain('reusable, generic agent skills')
  })

  it('uses a labeled validated form with visible mutation feedback', () => {
    expect(pageSource).toContain('<UForm')
    expect(pageSource).toContain('label="Review reason')
    expect(pageSource).toContain('name="reason"')
    expect(pageSource).toContain('type="submit"')
    expect(pageSource).toContain('useToast()')
  })

  it('adds the workflow to admin navigation', () => {
    expect(layoutSource).toContain('Repository reviews')
    expect(layoutSource).toContain('/admin/leaderboard-repositories')
    expect(appSource).toContain('<NuxtLayout')
    expect(appSource).toContain('isAdminLayout')
  })

  it('routes missing approved repositories through a dedicated priority queue', () => {
    expect(reviewJobSource).toContain(`queue: 'repo-review-sync'`)
    expect(nuxtConfig).toContain(`'repo-review-sync'`)
    expect(nuxtConfig).toContain(`binding: 'REPO_REVIEW_SYNC_QUEUE'`)
    expect(wranglerConfig).toContain('"binding": "REPO_REVIEW_SYNC_QUEUE"')
    expect(wranglerConfig).toContain('"queue": "skilld-repo-review-sync"')
  })
})
