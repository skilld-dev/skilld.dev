import { getWebMcpModelContext } from '../utils/webmcp-support'

type WebMcpModule = typeof import('../utils/webmcp-tools')

type ModuleLoadResult
  = | { _tag: 'ok', module: WebMcpModule }
    | { _tag: 'error', cause: unknown }

export default defineNuxtPlugin(async () => {
  const modelContext = getWebMcpModelContext(document)
  if (!modelContext)
    return

  const controller = new AbortController()
  const loaded = await import('../utils/webmcp-tools')
    .then(module => ({ _tag: 'ok' as const, module }))
    .catch((cause): ModuleLoadResult => ({ _tag: 'error', cause }))

  if (loaded._tag === 'error') {
    console.warn('[webmcp] Could not load discovery tools:', loaded.cause)
    return
  }

  const tools = loaded.module.createWebMcpTools({
    fetchApi: <T>(path: string, options?: {
      query?: Record<string, string | number>
      signal?: AbortSignal
    }): Promise<T> => $fetch<T>(path, {
      query: options?.query,
      signal: options?.signal,
    }),
    reportError: (operation, error) => console.error(`[webmcp:${operation}]`, error),
  }, controller.signal)

  const registered = await loaded.module.registerWebMcpTools(modelContext, tools, controller)
  if (registered._tag === 'error') {
    console.warn('[webmcp] Could not register discovery tools:', registered.cause)
    return
  }

  if (import.meta.hot)
    import.meta.hot.dispose(() => controller.abort())
})
