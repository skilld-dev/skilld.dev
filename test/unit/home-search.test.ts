import type { SearchRow, SearchState } from '../../app/composables/useSkillSearch'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, ref } from 'vue'
import HomeSearch from '../../app/components/HomeSearch.vue'

const navigate = vi.hoisted(() => vi.fn())
mockNuxtImport('navigateTo', () => navigate)

const query = ref('vue testing')
const open = ref(true)
const activeIndex = ref(0)
const rows = ref<SearchRow[]>([
  { _tag: 'skill', provisional: false, skill: { owner: 'antfu', repo: 'skills', name: 'vue-testing', slug: 'antfu/vue-testing', registryPath: '/gh/antfu/skills/vue-testing' } },
  { _tag: 'skill', provisional: false, skill: { owner: 'hyf0', repo: 'skills', name: 'vue-debug', slug: 'hyf0/vue-debug', registryPath: '/gh/hyf0/skills/vue-debug' } },
])

const initialRows = rows.value
const stateOverride = ref<SearchState | null>(null)
const submitRepository = vi.fn()

mockNuxtImport('useSkillSearch', () => () => ({
  query,
  trimmedQuery: computed(() => query.value.trim()),
  open,
  activeIndex,
  rows,
  activeRow: computed(() => rows.value[activeIndex.value] ?? null),
  state: computed<SearchState>(() => stateOverride.value ?? ({ _tag: 'ready', rows: rows.value, total: 2, mode: 'hybrid' })),
  move: (delta: number) => { activeIndex.value = (activeIndex.value + delta + rows.value.length) % rows.value.length },
  close: () => { open.value = false },
  reset: () => {
    query.value = ''
    activeIndex.value = 0
  },
  rememberQuery: vi.fn(),
  loadTypeaheadIndex: vi.fn(),
  submitRepository,
}))

const panel = defineComponent({
  setup: () => () => h('div', { id: 'skill-search-listbox', role: 'listbox' }, rows.value.map((row, index) =>
    h('div', { id: `skill-search-row-${index}`, role: 'option' }, row._tag === 'skill' ? row.skill.name : 'All results'))),
})

const wrappers: Awaited<ReturnType<typeof mountSuspended>>[] = []
async function mountSearch() {
  const wrapper = await mountSuspended(HomeSearch, {
    attachTo: document.body,
    global: { stubs: { SkillSearchPanel: panel, SkillSearchRepositoryModal: true } },
  })
  wrappers.push(wrapper)
  return wrapper
}

beforeEach(() => {
  navigate.mockReset()
  submitRepository.mockReset()
  stateOverride.value = null
  query.value = 'vue testing'
  open.value = true
  activeIndex.value = 0
  rows.value = initialRows
})
afterEach(() => {
  for (const wrapper of wrappers.splice(0))
    wrapper.unmount()
})

describe('homepage search interactions', () => {
  it('submits the query on Enter when results are present but none was selected', async () => {
    const wrapper = await mountSearch()
    await wrapper.get('input').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(navigate).toHaveBeenCalledWith({ path: '/skills', query: { q: 'vue testing' } })
  })

  it.each([
    ['ArrowDown', '/gh/antfu/skills/vue-testing'],
    ['ArrowUp', '/gh/hyf0/skills/vue-debug'],
  ])('selects with %s before Enter opens the Skill', async (key, path) => {
    const wrapper = await mountSearch()
    await wrapper.get('input').trigger('keydown', { key })
    await wrapper.get('input').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(navigate).toHaveBeenCalledWith(path)
  })

  it('uses the Search button for the full result page even after arrow selection', async () => {
    const wrapper = await mountSearch()
    await wrapper.get('input').trigger('keydown', { key: 'ArrowDown' })
    const button = wrapper.findAll('button').find(button => button.text().trim() === 'Search')
    expect(button, 'Search button must submit the full query').toBeDefined()
    await button!.trigger('click')
    await flushPromises()
    expect(navigate).toHaveBeenCalledWith({ path: '/skills', query: { q: 'vue testing' } })
  })

  it('reopens the panel when the already focused input is clicked', async () => {
    const wrapper = await mountSearch()
    const input = wrapper.get('input')
    input.element.focus()
    await input.trigger('focus')
    open.value = false
    await flushPromises()
    await input.trigger('click')
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)
  })

  it('connects the combobox to the rendered listbox', async () => {
    const wrapper = await mountSearch()
    const id = wrapper.get('input').attributes('aria-controls')
    expect(id).toBeTruthy()
    expect(wrapper.find(`[id="${id}"][role="listbox"]`).exists()).toBe(true)
  })

  it('closes on Escape without navigation', async () => {
    const wrapper = await mountSearch()
    await wrapper.get('input').trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('closes when focus moves outside the search', async () => {
    const wrapper = await mountSearch()
    await wrapper.get('input').trigger('focusout', { relatedTarget: document.body })
    await flushPromises()
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('clears keyboard selection when fresh results replace the displayed results', async () => {
    const wrapper = await mountSearch()
    await wrapper.get('input').trigger('keydown', { key: 'ArrowDown' })
    rows.value = [{ _tag: 'skill', provisional: false, skill: {
      owner: 'new-author',
      repo: 'skills',
      name: 'replacement',
      slug: 'new-author/replacement',
      registryPath: '/gh/new-author/skills/replacement',
    } }, ...initialRows]
    await flushPromises()
    await wrapper.get('input').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(navigate).toHaveBeenCalledWith({ path: '/skills', query: { q: 'vue testing' } })
  })

  it('clears keyboard selection when the query changes', async () => {
    const wrapper = await mountSearch()
    await wrapper.get('input').trigger('keydown', { key: 'ArrowDown' })
    await wrapper.get('input').setValue('pdf')
    await wrapper.get('input').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(navigate).toHaveBeenCalledWith({ path: '/skills', query: { q: 'pdf' } })
  })

  it.each(['button', 'Enter'])('indexes an idle repository using %s', async (action) => {
    const repository = { _tag: 'repository' as const, owner: 'antfu', repo: 'skills', url: 'https://github.com/antfu/skills' }
    query.value = repository.url
    rows.value = [{ _tag: 'repository', repository }]
    stateOverride.value = { _tag: 'repository', repository, status: { _tag: 'idle' }, rows: rows.value }
    const wrapper = await mountSearch()
    if (action === 'Enter') {
      await wrapper.get('input').trigger('keydown', { key: 'Enter' })
    }
    else {
      const button = wrapper.findAll('button').find(button => button.text().trim() === 'Index repository')
      expect(button).toBeDefined()
      await button!.trigger('click')
    }
    await flushPromises()
    expect(submitRepository).toHaveBeenCalledExactlyOnceWith(repository)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('blocks duplicate submission while repository indexing is pending', async () => {
    const repository = { _tag: 'repository' as const, owner: 'antfu', repo: 'skills', url: 'https://github.com/antfu/skills' }
    query.value = repository.url
    rows.value = [{ _tag: 'repository', repository }]
    stateOverride.value = { _tag: 'repository', repository, status: { _tag: 'pending', progress: { _tag: 'queued' } }, rows: rows.value }
    const wrapper = await mountSearch()
    const button = wrapper.findAll('button').find(button => button.text().trim() === 'Index repository')
    expect(button).toBeDefined()
    expect(button!.attributes('disabled')).toBeDefined()
    await button!.trigger('click')
    await wrapper.get('input').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(submitRepository).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('does not restore keyboard selection when a shortcut reopens the panel', async () => {
    const wrapper = await mountSearch()
    const input = wrapper.get('input')
    await input.trigger('keydown', { key: 'ArrowDown' })
    await input.trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
    // The global shortcut opens shared state before it focuses the input.
    open.value = true
    await input.trigger('focus')
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(navigate).toHaveBeenCalledWith({ path: '/skills', query: { q: 'vue testing' } })
  })

  it.each(['ArrowDown', 'ArrowUp'])('leaves composing %s to the IME', async (key) => {
    const wrapper = await mountSearch()
    const input = wrapper.get('input')
    const event = new KeyboardEvent('keydown', { key, isComposing: true, bubbles: true, cancelable: true })
    input.element.dispatchEvent(event)
    await flushPromises()
    expect(event.defaultPrevented).toBe(false)
    expect(input.attributes('aria-activedescendant')).toBeUndefined()
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(navigate).toHaveBeenCalledWith({ path: '/skills', query: { q: 'vue testing' } })
  })

  it('ignores Enter while an IME composition is active', async () => {
    const wrapper = await mountSearch()
    await wrapper.get('input').trigger('keydown', { key: 'Enter', isComposing: true })
    await flushPromises()
    expect(navigate).not.toHaveBeenCalled()
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)
  })
})
