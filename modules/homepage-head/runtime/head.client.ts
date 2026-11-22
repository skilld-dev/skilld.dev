import { headSymbol } from '@unhead/vue'
import { HookableCore } from 'hookable'
import { createHead } from 'unhead/lazy'
import { defineNuxtPlugin } from '#app/nuxt'
import { buildAssetsURL } from '#build/paths.mjs'
import { installClientHead } from '#skilld-install-head'

declare global {
  interface Window {
    /** Set before navigation to compare against Nuxt's eager renderer with the same SSR response. */
    __SKILLD_EAGER_HEAD__?: boolean
  }
}

export default defineNuxtPlugin({
  name: 'nuxt:head',
  enforce: 'pre',
  async setup(nuxtApp): Promise<void> {
    const assets = document.head.querySelector<HTMLMetaElement>('meta[name="skilld-head-assets"]')
    if (!assets || !nuxtApp.payload.serverRendered || window.__SKILLD_EAGER_HEAD__) {
      assets?.remove()
      const { default: plugin } = await import('#skilld-eager-head')
      await plugin(nuxtApp)
      return
    }

    const hooks = new HookableCore()
    const importPlugins = () => import('#build/unhead-options.mjs').then(options => options.default.plugins)
    let loadingPlugins: ReturnType<typeof importPlugins> | undefined
    const options = {
      disableDefaults: true,
      hookable: hooks,
      lazyPlugins: () => loadingPlugins ?? importPlugins(),
    }
    const head = createHead(options)
    let hydrated = false
    let loading: Promise<unknown> | undefined

    function load() {
      if (loading)
        return loading

      performance.mark('skilld-head-load-start')
      loadingPlugins = importPlugins()
      loading = Promise.all([head.load(), loadingPlugins]).then(() => {
        performance.mark('skilld-head-load-end')
      }).catch((error: unknown) => {
        loading = undefined
        loadingPlugins = undefined
        console.error('Homepage head could not load', error)
      })
      return loading
    }

    const push = head.push
    head.push = (input, options) => {
      const entry = push(input, options)
      const { patch, dispose } = entry
      if (hydrated || options?.onRendered)
        void load()
      entry.patch = (input) => {
        patch(input)
        if (hydrated)
          void load()
      }
      entry.dispose = () => {
        dispose()
        if (hydrated)
          void load()
      }
      return entry
    }

    const use = head.use
    head.use = (plugin) => {
      use(plugin)
      if (hydrated)
        void load()
    }
    hooks.hook('script:updated', ({ script }) => {
      if (script.status === 'loading')
        void load()
    })

    const installableHead = Object.assign(head, {
      install(app: typeof nuxtApp.vueApp) {
        app.config.globalProperties.$unhead = app.config.globalProperties.$head = head
        app.provide(headSymbol, head)
      },
    })
    // Nuxt installs only push, hooks, render and install before the shell activates.
    installClientHead(nuxtApp, installableHead as unknown as Parameters<typeof installClientHead>[1])

    nuxtApp.hook('app:suspense:resolve', () => {
      if (hydrated)
        return
      head.finishHydration()
      hydrated = true
      performance.mark('skilld-head-hydrated')
      const connection = (navigator as Navigator & { connection?: { rtt?: number } }).connection
      const rtt = connection?.rtt
      if (!rtt || rtt >= 150) {
        const warm = () => {
          if (loading)
            return
          performance.mark('skilld-head-warm')
          for (const file of assets.content.split(' ')) {
            const link = document.createElement('link')
            link.rel = 'modulepreload'
            link.setAttribute('fetchpriority', 'low')
            link.crossOrigin = ''
            link.href = buildAssetsURL(file)
            document.head.appendChild(link)
          }
        }
        if ('requestIdleCallback' in globalThis)
          requestIdleCallback(warm, { timeout: 1000 })
        else
          setTimeout(warm)
      }
      assets.remove()
    })
    nuxtApp.hook('app:created', () => {
      nuxtApp.$router.beforeEach((to, from) => {
        if (from.matched.length && to.path !== from.path)
          void load()
      })
    })
    nuxtApp.hook('page:start', () => {
      if (hydrated)
        void load()
    })
    nuxtApp.hook('app:error', () => {
      void load()
    })
  },
})
