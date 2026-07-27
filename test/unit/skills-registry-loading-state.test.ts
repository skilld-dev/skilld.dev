import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { reactive, ref } from 'vue'

const registryExecute = vi.hoisted(() => vi.fn())

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
      status: ref('idle'),
      error: ref(null),
      execute: registryExecute,
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
          DeveloperSkillSection: true,
          EditorialMasthead: { template: '<header><slot /><slot name="aside" /></header>' },
          OutcomeClusterGrid: true,
          SkillCard: true,
        },
      },
    },
  )
}

describe('skills registry loading state', () => {
  beforeEach(() => {
    route.query = { q: 'nuxt' }
    registryExecute.mockClear()
  })

  it('reserves the result region before a filtered request starts', async () => {
    const wrapper = await mountSkillsPage()

    expect(wrapper.get('[aria-label="Loading matching skills"]').attributes('aria-busy')).toBe('true')
    expect(wrapper.findAll('[data-loading-skill]')).toHaveLength(12)
    expect(registryExecute).toHaveBeenCalledOnce()
  })

  it('does not show registry loading state before filtering starts', async () => {
    route.query = {}

    const wrapper = await mountSkillsPage()

    expect(wrapper.find('[aria-label="Loading matching skills"]').exists()).toBe(false)
    expect(wrapper.find('[data-slot="leadingIcon"].animate-spin').exists()).toBe(false)
    expect(registryExecute).not.toHaveBeenCalled()
  })
})
