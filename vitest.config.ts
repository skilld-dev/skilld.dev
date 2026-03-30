import { defineVitestConfig } from '@nuxt/test-utils/config'
import { configDefaults } from 'vitest/config'

export default defineVitestConfig({
  test: {
    globals: true,
    environment: 'nuxt',
    exclude: [...configDefaults.exclude, 'test/e2e/**'],
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
