// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Guards `patches/hookable@*.patch`.
 *
 * Cloudflare workerd DEFINES `console.createTask` and throws
 * ERR_METHOD_NOT_IMPLEMENTED the moment it is called. Stock hookable
 * feature-detects the method by existence (`if (console.createTask)`) and
 * adopts it, so every `callHook` throws. On a Nuxt worker that is every
 * dynamic route, served as a 500.
 *
 * It only bites once something drags `node:console` into the bundle, which is
 * how it arrived here: `undici`, via `node-fetch-native`, pulled the module in
 * on a routine dependency bump and took the whole site down. Both deploys
 * rolled back on smoke.
 *
 * If a future install drops the patch, this test fails rather than the site.
 */
describe('hookable against a console.createTask that throws', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('still runs hooks', async () => {
    const createTask = vi.fn(() => {
      throw new Error('The Console.createTask method is not implemented')
    })
    vi.stubGlobal('console', Object.assign(Object.create(globalThis.console), { createTask }))

    // hookable captures the method at module evaluation, so the stub has to be
    // in place before the import.
    vi.resetModules()
    const { createHooks } = await import('hookable')

    const hooks = createHooks<{ probe: (value: string) => void }>()
    const seen: string[] = []
    hooks.hook('probe', (value) => {
      seen.push(value)
    })

    await hooks.callHook('probe', 'ran')

    expect(seen).toEqual(['ran'])
    // The probe is allowed to call it once to find out that it does not work.
    // What matters is that the failure is not adopted for every later hook.
    expect(createTask.mock.calls.length).toBeLessThanOrEqual(1)
  })
})
