import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import CuratorOgImage from '../../app/components/OgImage/Curator.takumi.vue'

const stubs = {
  OgLayout: { template: '<div><slot /></div>' },
  OgBrand: { template: '<div />' },
}

describe('curator OG image', () => {
  it('renders a login that arrived from the URL as a number', async () => {
    // `/gh/24601` encodes `handle_24601` into the OG image URL, which decodes
    // back as the number 24601. The island used to throw "split is not a
    // function" on it.
    const component = await mountSuspended(CuratorOgImage, {
      props: { handle: 24601, collectionCount: 0, skillCount: 0 },
      global: { stubs },
    })

    expect(component.text()).toContain('@24601')
    expect(component.text()).toContain('2')
  })

  it('shows the display name initials over the handle', async () => {
    const component = await mountSuspended(CuratorOgImage, {
      props: { handle: 'harlan-zw', displayName: 'Harlan Wilton', collectionCount: 2, skillCount: 1 },
      global: { stubs },
    })

    expect(component.text()).toContain('Harlan Wilton')
    expect(component.text()).toContain('@harlan-zw')
    expect(component.text()).toContain('2 collections · 1 skill')
  })

  it('counts stats that arrived as text', async () => {
    const component = await mountSuspended(CuratorOgImage, {
      props: { handle: 'harlan-zw', collectionCount: '3', skillCount: '10' },
      global: { stubs },
    })

    expect(component.text()).toContain('3 collections · 10 skills')
  })

  it('shows the real avatar and leading skill display names', async () => {
    const component = await mountSuspended(CuratorOgImage, {
      props: {
        handle: 'hyf0',
        avatar: 'https://github.com/hyf0.png?size=128',
        skills: ['Vue Best Practices', 'Vite'],
        collectionCount: 0,
        skillCount: 2,
      },
      global: { stubs },
    })

    expect(component.get('img').attributes('src')).toBe('https://github.com/hyf0.png?size=128')
    expect(component.text()).toContain('Vue Best Practices')
    expect(component.text()).toContain('Vite')
  })
})
