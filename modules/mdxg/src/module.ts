import {
  addComponentsDir,
  addImportsDir,
  addPlugin,
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

// MDXG extension plugins (math, diagrams) are configured at the @nuxtjs/mdc
// layer, not here — mdxg consumes whatever AST mdc emits. To enable:
//
//   // nuxt.config.ts
//   mdc: {
//     remarkPlugins: { 'remark-math': { options: {} } },
//     rehypePlugins: { 'rehype-katex': { options: {} } },
//   }
//
// GFM (including footnotes + task lists) is already enabled by mdc's default
// pipeline; no extra config needed.

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

    // Parsing + rendering is delegated to @nuxtjs/mdc. If the consumer already
    // installed @nuxt/content (which pulls mdc transitively + registers
    // MDCRenderer), don't re-install.
    if (!hasNuxtModule('@nuxt/content') && !hasNuxtModule('@nuxtjs/mdc'))
      await installModule('@nuxtjs/mdc')

    addComponentsDir({
      path: resolve('./runtime/components'),
      prefix: options.prefix ?? 'Mdxg',
      pathPrefix: false,
      global: false,
    })

    addImportsDir(resolve('./runtime/composables'))
    addImportsDir(resolve('./runtime/utils'))
    addServerImportsDir(resolve('./runtime/utils'))

    // Wire @nuxtjs/mdc's bundled Shiki highlighter into parseMdxg defaults.
    // Client-only: the bundled Shiki Oniguruma engine ships WebAssembly that
    // Cloudflare workerd's nitro preset can't always load at SSR time. Server
    // routes that need highlighted output should pass an explicit highlighter
    // via `parseMdxg(source, { mdcOptions: { highlight: { highlighter } } })`.
    addPlugin({ src: resolve('./runtime/plugin.ts'), mode: 'client' })
  },
})
