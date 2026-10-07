import type { ConfigEnv, TestProjectConfiguration, ViteUserConfig } from 'vitest/config'
import { availableParallelism } from 'node:os'
import { fileURLToPath } from 'node:url'
import { defineVitestConfig } from '@nuxt/test-utils/config'
import { configDefaults } from 'vitest/config'

/**
 * Workers spend most of their time loading modules, so a run with fewer
 * workers than cores leaves cores idle.
 *
 * `availableParallelism()` honours a container CPU quota. Under a 4-CPU quota,
 * like the CI container, 4 workers ran the suite in 28 s and 2 workers in 40 s.
 * On a 24-core machine, 12 workers beat both 6 and 16. The cap also keeps the
 * old failure away: many workers that boot Nuxt at once failed to spawn
 * ("Failed to start forks worker"), and arbitrary files failed on each run.
 */
const MAX_WORKERS = Math.max(4, Math.min(12, availableParallelism()))

/**
 * `@nuxt/test-utils` adds this setup file to every project. It loads
 * `@vue/test-utils` and the Vue compiler in every test file. Only the Nuxt
 * environment uses it, and it cost the node project about 40 ms per file.
 */
function isNuxtRuntimeEntry(file: string): boolean {
  return file.includes('/@nuxt/test-utils/') && file.includes('/runtime/entry')
}

const nuxtVitestConfig = defineVitestConfig({
  resolve: { alias: { '#checkin/checks': fileURLToPath(new URL('./test/fixtures/checkin-registry.ts', import.meta.url)) } },
  test: {
    globals: true,
    // A non-Nuxt default makes `defineVitestConfig` split the suite in two:
    // `*.nuxt.test.ts` and `*.nuxt.spec.ts` boot a Nuxt app in the `nuxt`
    // project, and every other file runs in the plain `node` project.
    environment: 'node',
    maxWorkers: MAX_WORKERS,
    /**
     * A Nuxt test file boots the app in a per-file hook. The 10 s default is
     * that boot on an idle machine: loaded runners timed out the boot on
     * arbitrary files with zero assertion failures.
     */
    hookTimeout: 30_000,
    setupFiles: ['./test/setup-wide-events.ts'],
    // `.claude/worktrees/**` holds checkouts belonging to background agents.
    // Without this they are collected as a second copy of the whole suite,
    // which fails on their own resolution roots and buries real results.
    exclude: [...configDefaults.exclude, 'test/e2e/**', '.claude/worktrees/**'],
    server: {
      deps: {
        inline: ['axe-core', 'nitropack'],
      },
    },
    environmentOptions: {
      nuxt: {
        domEnvironment: 'happy-dom',
      },
    },
  },
})

function tuneProject(project: TestProjectConfiguration): TestProjectConfiguration {
  if (typeof project !== 'object' || 'then' in project || !project.test)
    return project
  if (project.test.name === 'nuxt')
    return { ...project, test: { ...project.test, pool: 'threads' } }

  const setupFiles = [project.test.setupFiles ?? []].flat()
  if (!setupFiles.some(isNuxtRuntimeEntry))
    throw new Error('The @nuxt/test-utils runtime entry moved. Update isNuxtRuntimeEntry in vitest.config.ts.')
  return {
    ...project,
    test: {
      ...project.test,
      setupFiles: setupFiles.filter(file => !isNuxtRuntimeEntry(file)),
      // One VM context per file keeps each file isolated in a reused worker,
      // where the default pool starts a new worker per file. The Nuxt
      // environment cannot run in a VM context, so Nuxt tests use the suffix.
      pool: 'vmThreads',
    },
  }
}

export default async function vitestConfig(env: ConfigEnv): Promise<ViteUserConfig> {
  const config = await nuxtVitestConfig(env) as ViteUserConfig
  const projects = config.test?.projects
  if (!projects)
    throw new Error('defineVitestConfig no longer splits the suite into projects. Revisit vitest.config.ts.')
  return { ...config, test: { ...config.test, projects: projects.map(tuneProject) } }
}
