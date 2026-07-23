import { mountSuspended } from '@nuxt/test-utils/runtime'

describe('header color mode button', () => {
  it('uses a compact neutral ghost button', async () => {
    vi.stubGlobal('defineOgImage', vi.fn())

    const wrapper = await mountSuspended(
      await import('~/app.vue').then(module => module.default),
      {
        global: {
          stubs: {
            NuxtPage: true,
          },
        },
      },
    )

    const button = wrapper.get('button[aria-label*="mode"]')

    expect(button.classes()).toContain('hover:bg-elevated')
    expect(button.findAll('[class~="size-4"]')).toHaveLength(2)
    expect(button.classes()).not.toContain('bg-primary')
  })
})
