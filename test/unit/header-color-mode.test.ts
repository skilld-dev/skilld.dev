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

  it('opens mobile navigation without mounting a dialog', async () => {
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

    const toggle = wrapper.get('button[aria-controls="mobile-navigation"]')

    expect(toggle.attributes('aria-expanded')).toBe('false')

    await toggle.trigger('click')

    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('#mobile-navigation').get('nav').attributes('aria-label')).toBe('Mobile navigation')
    expect(wrapper.get('main').classes()).toContain('[contain:style]')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })
})
