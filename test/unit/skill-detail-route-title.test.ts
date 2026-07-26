import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { reactive } from 'vue'
import { resolveSkillTitle } from '../../layers/registry/app/utils/skill-title'

const route = reactive({
  path: '/gh/antfu/skills/nuxt',
  query: {},
  params: {
    owner: 'antfu',
    repo: 'skills',
    name: 'nuxt',
  },
})

mockNuxtImport('useRoute', () => {
  return () => route
})

describe('skill detail route title', () => {
  it('sets a useful title before the skill payload loads', async () => {
    const wrapper = await mountSuspended(
      await import('../../layers/registry/app/pages/gh/[owner]/[repo]/[name].vue').then(module => module.default),
      {
        global: {
          stubs: {
            SkillDetail: true,
          },
        },
      },
    )

    await vi.waitFor(() => {
      expect(document.title).toMatch(/^nuxt by antfu(?:\s[|·]\s.*)?$/)
    })

    wrapper.unmount()
  })

  it('falls back to route identity while the skill payload loads', () => {
    expect(resolveSkillTitle(undefined, {
      name: 'nuxt',
      owner: 'antfu',
    })).toBe('nuxt by antfu')
  })
})
