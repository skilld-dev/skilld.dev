// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The other half of `patches/hookable@*.patch`, in its own file because
 * hookable captures `console.createTask` once at module evaluation and
 * `vi.resetModules()` does not reliably re-evaluate a real node_modules ESM
 * import within a single file.
 *
 * The patch must not cost anything on a runtime that implements the method.
 * It exists for async stack traces in hook callbacks, and a fix that
 * unconditionally fell back to the no-op task would quietly throw that away
 * everywhere, not just on workerd.
 */
describe('hookable against a console.createTask that works', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('still uses it', async () => {
    const run = vi.fn((fn: () => unknown) => fn())
    const createTask = vi.fn(() => ({ run }))
    vi.stubGlobal('console', Object.assign(Object.create(globalThis.console), { createTask }))

    const { createHooks } = await import('hookable')

    const hooks = createHooks<{ probe: () => void }>()
    const seen: string[] = []
    hooks.hook('probe', () => {
      seen.push('ran')
    })
    await hooks.callHook('probe')

    expect(seen).toEqual(['ran'])
    expect(run).toHaveBeenCalled()
  })
})
