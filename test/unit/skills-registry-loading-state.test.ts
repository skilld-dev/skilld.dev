import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { reactive, ref } from 'vue'

const route = reactive({
  path: '/skills',
  query: { q: 'nuxt' } as Record<string, string>,
  params: {},
})

mockNuxtImport('useRoute', () => {
  return () => route
})

mockNuxtImport('useBotDetection', () => {
  return () => ({ isBot: ref(false) })
})

mockNuxtImport('useFetch', () => {
  return (url: string | (() => string)) => {
    const resolvedUrl = typeof url === 'function' ? url() : url
    if (resolvedUrl === '/api/skills/tags') {
      return {
        data: ref({ tags: [], total: 0 }),
        status: ref('success'),
        error: ref(null),
        refresh: vi.fn(),
      }
    }
    if (resolvedUrl === '/api/skills/featured') {
      return {
        data: ref(undefined),
        status: ref('idle'),
        error: ref(null),
        refresh: vi.fn(),
      }
    }
    return {
      data: ref(undefined),
      status: ref('pending'),
      error: ref(null),
      refresh: vi.fn(),
    }
  }
})

async function mountSkillsPage() {
  vi.stubGlobal('defineOgImage', vi.fn())
  return await mountSuspended(
    await import('../../layers/marketing/app/pages/skills/index.vue').then(module => module.default),
    {
      global: {
        stubs: {
          EditorialMasthead: { template: '<header><slot /><slot name="aside" /></header>' },
          SkillTable: true,
        },
      },
    },
  )
}

describe('skills registry loading state', () => {
  beforeEach(() => {
    route.query = { q: 'nuxt' }
  })

  it('reserves the table region while a filtered request is in flight', async () => {
    const wrapper = await mountSkillsPage()

    expect(wrapper.get('[aria-label="Loading skills"]').attributes('aria-busy')).toBe('true')
    expect(wrapper.findAll('[data-loading-skill]')).toHaveLength(20)
  })

  it('reserves the same region for the unfiltered browse table', async () => {
    route.query = {}

    const wrapper = await mountSkillsPage()

    expect(wrapper.find('[aria-label="Loading skills"]').exists()).toBe(true)
  })
})
