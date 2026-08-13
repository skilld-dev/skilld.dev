import { availableParallelism } from 'node:os'
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
  test: {
    globals: true,
    environment: 'nuxt',
    maxWorkers: MAX_WORKERS,
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
