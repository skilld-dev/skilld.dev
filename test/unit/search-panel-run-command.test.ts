import type { SearchRow, SearchSkill } from '../../app/composables/useSkillSearch'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'

const skill: SearchSkill = {
  name: 'vite',
  owner: 'antfu',
  repo: 'skills',
  slug: 'antfu/vite',
  description: 'Vite configuration conventions.',
  stars: 1200,
}

const rows = ref<SearchRow[]>([{ _tag: 'skill', skill, provisional: false }])

const installEvents: Record<string, unknown>[] = []

registerEndpoint('/api/events/install', {
  method: 'POST',
  handler: async (event) => {
    installEvents.push(await readBody(event))
    return { ok: true }
  },
})

mockNuxtImport('useSkillSearch', () => () => ({
  query: ref('vite'),
  state: computed(() => ({ _tag: 'ready' as const, rows: rows.value, total: 1, mode: 'hybrid' as const, repository: null })),
  rows,
  activeIndex: ref(0),
  activeColumn: ref(0),
  activeRow: computed(() => rows.value[0] ?? null),
  recentSearches: ref([]),
  retry: vi.fn(),
  submitRepository: vi.fn(),
}))

describe('search panel command grammar', () => {
  beforeEach(() => {
    installEvents.length = 0
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('copies the run command from a Skill row', async () => {
    // vueuse falls back to execCommand here, so capture whichever path runs.
    const copied: string[] = []
    const writeText = vi.fn((text: string) => {
      copied.push(text)
      return Promise.resolve()
    })
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText } as unknown as Clipboard)
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => {
        const textarea = document.querySelector('textarea')
        if (textarea)
          copied.push(textarea.value)
        return true
      }),
    })
    const wrapper = await mountSuspended(
      await import('../../app/components/SkillSearchPanel.vue').then(module => module.default),
    )

    const copyButton = wrapper.findAll('button')
      .find(button => button.attributes('aria-label')?.includes('run command'))
    expect(copyButton, 'row run chip missing its run-command label').toBeTruthy()

    await copyButton!.trigger('click')
    await flushPromises()

    expect(copied).toContain('npx skilld run antfu/skills/vite')
    // The ledger has to see a run, not an install, or the daily split lies.
    await vi.waitFor(() => {
      expect(installEvents).toContainEqual(expect.objectContaining({
        surface: 'search-panel',
        mode: 'run',
      }))
    })

    wrapper.unmount()
  })
})
