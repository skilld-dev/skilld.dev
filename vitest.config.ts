import { availableParallelism } from 'node:os'
import { fileURLToPath } from 'node:url'
import { defineVitestConfig } from '@nuxt/test-utils/config'
import { configDefaults } from 'vitest/config'

/**
 * Every worker boots a full Nuxt environment, so the default of one per core
 * is far too many on a large machine: workers fail to spawn ("Cannot find
 * package 'happy-dom'", "Failed to start forks worker") and a different,
 * arbitrary test file fails on each run while all of them pass in isolation.
 *
 * Measured on a 24-core machine: uncapped flaked on every run, capped at 6 the
 * full suite passed twice consecutively. Capping trades a little wall clock
 * for a suite whose failures actually mean something.
 */
const MAX_WORKERS = Math.max(2, Math.min(6, availableParallelism() - 2))

export default defineVitestConfig({
  resolve: { alias: { '#checkin/checks': fileURLToPath(new URL('./test/fixtures/checkin-registry.ts', import.meta.url)) } },
  test: {
    globals: true,
    environment: 'nuxt',
    maxWorkers: MAX_WORKERS,
    /**
     * Booting the Nuxt environment happens in a per-file hook, and the 10s
     * default is the boot time on an idle machine with no headroom. Capping the
     * workers above fixed the spawn failures but not this: a loaded runner
     * still timed out the boot on three arbitrary files with zero assertion
     * failures, and a different three locally on the same commit. The two-core
     * ARM CI runner has the least headroom of anywhere this runs.
     */
    hookTimeout: 30_000,
    setupFiles: ['./test/setup-wide-events.ts'],
    // `.claude/worktrees/**` holds checkouts belonging to background agents.
    // Without this they are collected as a second copy of the whole suite,
    // which fails on their own resolution roots and buries real results.
    exclude: [...configDefaults.exclude, 'test/e2e/**', '.claude/worktrees/**'],
    server: {
      deps: {
        inline: ['axe-core'],
      },
    },
    environmentOptions: {
      nuxt: {
        domEnvironment: 'happy-dom',
      },
    },
  },
})
