import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://localhost:5678'

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  timeout: 120_000,
  // The script runs the built Worker with wrangler. `nuxi preview` ignores
  // `--port` on the Cloudflare preset and listens on 8787. The Worker reads
  // the migrated local D1 that `pnpm dev` uses. Without it, every Skill API
  // call fails with 500 and pages render their error state.
  webServer: {
    command: 'pnpm start:playwright:webserver',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  snapshotPathTemplate: '{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}{ext}',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
