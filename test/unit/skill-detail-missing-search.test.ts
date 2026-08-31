import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'

const route = reactive({
  path: '/gh/hack23/old-repo/logging%20and%20monitoring%20for%20agentic%20workflows',
  query: {},
  params: {
    owner: 'hack23',
    repo: 'old-repo',
    name: 'logging and monitoring for agentic workflows',
  },
})

mockNuxtImport('useRoute', () => () => route)
mockNuxtImport('navigateTo', () => vi.fn())
mockNuxtImport('useSchemaOrg', () => () => {})
mockNuxtImport('useAsyncData', () => () => ({
  data: ref(null),
  status: ref('success'),
  error: ref(null),
  refresh: vi.fn(),
}))
vi.stubGlobal('defineOgImage', () => {})

const match = {
  owner: 'hack23',
  repo: 'riksdagsmonitor',
  name: 'logging and monitoring for agentic workflows',
  displayName: 'Logging and monitoring for agentic workflows',
  description: 'Observability guidance for agent workflows.',
  stars: 42,
}
const searchData = ref<{ items: typeof match[], total: number } | null>({ items: [match], total: 1 })
const searchStatus = ref<'success' | 'pending' | 'error'>('success')
const searchError = ref<Error | null>(null)

mockNuxtImport('useFetch', () => (url: unknown) => {
  const key = typeof url === 'function' ? url() : url

  if (key === '/api/skills') {
    return {
      data: searchData,
      status: searchStatus,
      error: searchError,
      refresh: vi.fn(),
      execute: vi.fn(),
    }
  }

  if (typeof key === 'string' && key.startsWith('/api/skills/')) {
    return {
      data: ref(null),
      status: ref('error'),
      error: ref({ statusCode: 404 }),
      refresh: vi.fn(),
    }
  }

  if (typeof key === 'string' && key.startsWith('/api/skill-related/')) {
    return {
      data: ref({ commits: [], relatedRepoSkills: [], relatedOwnerSkills: [], coOccurrenceSkills: [], semanticSiblings: [] }),
      status: ref('success'),
      error: ref(null),
      refresh: vi.fn(),
    }
  }

  return { data: ref(null), status: ref('success'), error: ref(null), refresh: vi.fn() }
})

describe('missing Skill recovery', () => {
  beforeEach(() => {
    searchData.value = { items: [match], total: 1 }
    searchStatus.value = 'success'
    searchError.value = null
  })

  it('offers a live search match for the missing Skill name', async () => {
    const wrapper = await mountSuspended(
      await import('../../layers/registry/app/components/SkillDetail.vue').then(module => module.default),
      { props: route.params },
    )

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Closest matches')
      expect(wrapper.text()).toContain('Logging and monitoring for agentic workflows')
    })

    expect(wrapper.get('[data-testid="missing-skill-match"]').attributes('href'))
      .toContain('/gh/hack23/riksdagsmonitor/logging')
    expect(wrapper.get('[data-testid="missing-skill-all-matches"]').attributes('href'))
      .toContain('/skills?q=logging')

    wrapper.unmount()
  })

  it('offers a scoped retry when matching search fails', async () => {
    searchData.value = null
    searchStatus.value = 'error'
    searchError.value = new Error('offline')

    const wrapper = await mountSuspended(
      await import('../../layers/registry/app/components/SkillDetail.vue').then(module => module.default),
      { props: route.params },
    )

    expect(wrapper.text()).toContain('Couldn\'t load similar skills.')
    expect(wrapper.get('button').text()).toContain('Retry search')
    wrapper.unmount()
  })

  it('states when matching search finds nothing', async () => {
    searchData.value = { items: [], total: 0 }

    const wrapper = await mountSuspended(
      await import('../../layers/registry/app/components/SkillDetail.vue').then(module => module.default),
      { props: route.params },
    )

    expect(wrapper.text()).toContain('No similar skills found.')
    wrapper.unmount()
  })

  it('announces matching search while it is pending', async () => {
    searchData.value = null
    searchStatus.value = 'pending'

    const wrapper = await mountSuspended(
      await import('../../layers/registry/app/components/SkillDetail.vue').then(module => module.default),
      { props: route.params },
    )

    expect(wrapper.get('[role="status"]').text()).toContain('Searching for similar skills')
    wrapper.unmount()
  })
})
