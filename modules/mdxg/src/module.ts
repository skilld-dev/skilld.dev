import {
  addComponentsDir,
  addImportsDir,
  addServerImportsDir,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
  installModule,
} from '@nuxt/kit'

export interface ModuleOptions {
  // Prefix applied to auto-imported components (default `Mdxg`).
  prefix?: string
  // Inject the default stylesheet. Set false to ship class hooks only.
  // Tokens (CSS variables) are overridable at any scope.
  theme?: 'default' | false
}

// MDXG extension plugins are passed through `parseMdxg` parser options.
//
//   parseMdxg(source, { parserOptions: { plugins: [math()] } })

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'mdxg',
    configKey: 'mdxg',
    compatibility: { nuxt: '>=3.0.0' },
  },
  defaults: {
    prefix: 'Mdxg',
    theme: 'default',
  },
  async setup(options, nuxt) {
    const { resolve } = createResolver(import.meta.url)

    if (options.theme !== false)
      nuxt.options.css.push(resolve('./runtime/styles.css'))

    if (!hasNuxtModule('@comark/nuxt'))
      await installModule('@comark/nuxt')

    addComponentsDir({
      path: resolve('./runtime/components'),
      prefix: options.prefix ?? 'Mdxg',
      pathPrefix: false,
      global: false,
    })

    addImportsDir(resolve('./runtime/composables'))
    addImportsDir(resolve('./runtime/utils'))
    addServerImportsDir(resolve('./runtime/utils'))
  },
})
