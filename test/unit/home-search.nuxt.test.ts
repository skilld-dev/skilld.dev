import type { SearchRow, SearchState } from '../../app/composables/useSkillSearch'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, ref } from 'vue'
import HomeSearch from '../../app/components/HomeSearch.vue'

const navigate = vi.hoisted(() => vi.fn())
mockNuxtImport('navigateTo', () => navigate)

const query = ref('vue')
const open = ref(true)
const activeIndex = ref(-1)
const activeColumn = ref<0 | 1>(0)
const repositoryRow: SearchRow = {
  _tag: 'repository',
  repository: { owner: 'vercel-labs', repo: 'agent-skills', stars: 32000, skillCount: 7, registryPath: '/gh/vercel-labs/agent-skills' },
}
const rows = ref<SearchRow[]>([
  { _tag: 'skill', provisional: false, skill: { owner: 'antfu', repo: 'skills', name: 'vue-testing', slug: 'antfu/vue-testing', registryPath: '/gh/antfu/skills/vue-testing' } },
  { _tag: 'skill', provisional: false, skill: { owner: 'hyf0', repo: 'skills', name: 'vue-debug', slug: 'hyf0/vue-debug', registryPath: '/gh/hyf0/skills/vue-debug' } },
])

const initialRows = rows.value
const stateOverride = ref<SearchState | null>(null)
const submitRepository = vi.fn()
const copied = vi.fn()

mockNuxtImport('useSkillSearch', () => () => ({
  query,
  trimmedQuery: computed(() => query.value.trim()),
  open,
  activeIndex,
  activeColumn,
  rows,
  activeRow: computed(() => rows.value[activeIndex.value] ?? null),
  state: computed<SearchState>(() => stateOverride.value ?? ({ _tag: 'ready', rows: rows.value, total: 2, mode: 'hybrid', repository: null })),
  close: () => { open.value = false },
  reset: () => {
    query.value = ''
    activeIndex.value = -1
  },
  rememberQuery: vi.fn(),
  loadTypeaheadIndex: vi.fn(),
  submitRepository,
  recentSearches: ref([]),
  retry: vi.fn(),
  taskSearch: ref({ _tag: 'idle' }),
}))

// The real panel draws the same ids; this stub keeps the test on the box.
const panel = defineComponent({
  setup: () => () => h('div', { id: 'skill-search-grid', role: 'grid' }, rows.value.map((row, index) =>
    h('div', { role: 'row' }, [
      h('div', { id: `skill-search-row-${index}`, role: 'gridcell' }, row._tag === 'skill' ? row.skill.name : row._tag),
      row._tag === 'skill'
        ? h('div', { id: `skill-search-row-${index}-run`, role: 'gridcell' }, [h('button', { type: 'button', onClick: () => copied(row.skill.name) }, 'copy')])
        : null,
    ]))),
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

async function press(wrapper: Awaited<ReturnType<typeof mountSearch>>, ...keys: string[]) {
  for (const key of keys)
    await wrapper.get('input').trigger('keydown', { key })
  await flushPromises()
}

beforeEach(() => {
  navigate.mockReset()
  submitRepository.mockReset()
  copied.mockReset()
  stateOverride.value = null
  query.value = 'vue'
  open.value = true
  activeIndex.value = -1
  activeColumn.value = 0
  rows.value = initialRows
})
afterEach(() => {
  for (const wrapper of wrappers.splice(0))
    wrapper.unmount()
})

describe('homepage search interactions', () => {
  it('submits a name to the results page on Enter when nothing was selected', async () => {
    const wrapper = await mountSearch()
    await press(wrapper, 'Enter')
    expect(navigate).toHaveBeenCalledWith({ path: '/skills', query: { q: 'vue' } })
  })

  it('submits a sentence to the results page with the semantic lane on', async () => {
    query.value = 'test a vue app'
    const wrapper = await mountSearch()
    await press(wrapper, 'Enter')
    expect(navigate).toHaveBeenCalledWith({ path: '/skills', query: { q: 'test a vue app', ai: '1' } })
  })

  it.each([
    ['ArrowDown', '/gh/antfu/skills/vue-testing'],
    ['ArrowUp', '/gh/hyf0/skills/vue-debug'],
  ])('selects with %s before Enter opens the Skill', async (key, path) => {
    const wrapper = await mountSearch()
    await press(wrapper, key, 'Enter')
    expect(navigate).toHaveBeenCalledWith(path)
  })

  it('moves to the run chip with ArrowRight, and Enter copies instead of opening', async () => {
    const wrapper = await mountSearch()
    await press(wrapper, 'ArrowDown', 'ArrowRight')
    expect(wrapper.get('input').attributes('aria-activedescendant')).toBe('skill-search-row-0-run')
    await press(wrapper, 'Enter')
    expect(copied).toHaveBeenCalledExactlyOnceWith('vue-testing')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('leaves ArrowRight to the caret until a row is selected', async () => {
    const wrapper = await mountSearch()
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
    wrapper.get('input').element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(wrapper.get('input').attributes('aria-activedescendant')).toBeUndefined()
  })

  it('opens a Repository row on its Repository page', async () => {
    query.value = 'vercel-labs/agent-skills'
    rows.value = [repositoryRow, ...initialRows]
    stateOverride.value = { _tag: 'ready', rows: rows.value, total: 7, repository: repositoryRow.repository }
    const wrapper = await mountSearch()
    await press(wrapper, 'Enter')
    expect(navigate).toHaveBeenCalledWith('/gh/vercel-labs/agent-skills')
  })

  it('uses the submit control for the full result page even after arrow selection', async () => {
    const wrapper = await mountSearch()
    await press(wrapper, 'ArrowDown')
    await wrapper.get('button[aria-label="Search"]').trigger('click')
    await flushPromises()
    expect(navigate).toHaveBeenCalledWith({ path: '/skills', query: { q: 'vue' } })
  })

  it('offers no submit control until there is a query', async () => {
    query.value = '   '
    const wrapper = await mountSearch()
    expect(wrapper.get('button[type="submit"]').isVisible()).toBe(false)
  })

  it('reopens the panel when the already focused input is clicked', async () => {
    const wrapper = await mountSearch()
    const input = wrapper.get('input')
    input.element.focus()
    await input.trigger('focus')
    open.value = false
    await flushPromises()
    await input.trigger('click')
    expect(wrapper.find('[role="grid"]').exists()).toBe(true)
  })

  it('connects the combobox to the rendered grid', async () => {
    const wrapper = await mountSearch()
    const id = wrapper.get('input').attributes('aria-controls')
    expect(id).toBeTruthy()
    expect(wrapper.find(`[id="${id}"][role="grid"]`).exists()).toBe(true)
  })

  it('closes on Escape without navigation', async () => {
    const wrapper = await mountSearch()
    await press(wrapper, 'Escape')
    expect(wrapper.find('[role="grid"]').exists()).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('opens a Skill row on a pointer click', async () => {
    const wrapper = await mountSuspended(HomeSearch, {
      attachTo: document.body,
      global: { stubs: { SkillSearchRepositoryModal: true } },
    })
    wrappers.push(wrapper)
    const input = wrapper.get('input').element
    input.focus()
    await flushPromises()
    const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    wrapper.get('#skill-search-row-0').element.dispatchEvent(press)
    // A browser moves focus off the input on a press it does not cancel.
    if (!press.defaultPrevented)
      input.blur()
    await flushPromises()
    await wrapper.get('#skill-search-row-0').trigger('click')
    await flushPromises()
    expect(navigate).toHaveBeenCalledWith('/gh/antfu/skills/vue-testing')
  })

  it('closes when focus moves outside the search', async () => {
    const wrapper = await mountSearch()
    await wrapper.get('input').trigger('focusout', { relatedTarget: document.body })
    await flushPromises()
    expect(wrapper.find('[role="grid"]').exists()).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('clears keyboard selection when fresh results replace the displayed results', async () => {
    const wrapper = await mountSearch()
    await press(wrapper, 'ArrowDown')
    rows.value = [{ _tag: 'skill', provisional: false, skill: {
      owner: 'new-author',
      repo: 'skills',
      name: 'replacement',
      slug: 'new-author/replacement',
      registryPath: '/gh/new-author/skills/replacement',
    } }, ...initialRows]
    await flushPromises()
    await press(wrapper, 'Enter')
    expect(navigate).toHaveBeenCalledWith({ path: '/skills', query: { q: 'vue' } })
  })

  it('clears keyboard selection when the query changes', async () => {
    const wrapper = await mountSearch()
    await press(wrapper, 'ArrowDown')
    await wrapper.get('input').setValue('pdf')
    await press(wrapper, 'Enter')
    expect(navigate).toHaveBeenCalledWith({ path: '/skills', query: { q: 'pdf' } })
  })

  it.each(['button', 'Enter'])('indexes an idle repository using %s', async (action) => {
    const repository = { _tag: 'repository' as const, owner: 'antfu', repo: 'skills', url: 'https://github.com/antfu/skills' }
    query.value = repository.url
    rows.value = [{ _tag: 'index', repository }]
    stateOverride.value = { _tag: 'repository', repository, status: { _tag: 'idle' }, rows: rows.value }
    const wrapper = await mountSearch()
    if (action === 'Enter') {
      await press(wrapper, 'Enter')
    }
    else {
      await wrapper.get('button[aria-label="Index repository"]').trigger('click')
      await flushPromises()
    }
    expect(submitRepository).toHaveBeenCalledExactlyOnceWith(repository)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('blocks duplicate submission while repository indexing is pending', async () => {
    const repository = { _tag: 'repository' as const, owner: 'antfu', repo: 'skills', url: 'https://github.com/antfu/skills' }
    query.value = repository.url
    rows.value = []
    stateOverride.value = { _tag: 'repository', repository, status: { _tag: 'pending', progress: { _tag: 'queued' } }, rows: [] }
    const wrapper = await mountSearch()
    const button = wrapper.get('button[aria-label="Index repository"]')
    expect(button.attributes('disabled')).toBeDefined()
    await button.trigger('click')
    await press(wrapper, 'Enter')
    expect(submitRepository).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('does not restore keyboard selection when a shortcut reopens the panel', async () => {
    const wrapper = await mountSearch()
    await press(wrapper, 'ArrowDown', 'Escape')
    expect(wrapper.find('[role="grid"]').exists()).toBe(false)
    // The global shortcut opens shared state before it focuses the input.
    open.value = true
    await wrapper.get('input').trigger('focus')
    await press(wrapper, 'Enter')
    expect(navigate).toHaveBeenCalledWith({ path: '/skills', query: { q: 'vue' } })
  })

  it.each(['ArrowDown', 'ArrowUp'])('leaves composing %s to the IME', async (key) => {
    const wrapper = await mountSearch()
    const input = wrapper.get('input')
    const event = new KeyboardEvent('keydown', { key, isComposing: true, bubbles: true, cancelable: true })
    input.element.dispatchEvent(event)
    await flushPromises()
    expect(event.defaultPrevented).toBe(false)
    expect(input.attributes('aria-activedescendant')).toBeUndefined()
    await press(wrapper, 'Enter')
    expect(navigate).toHaveBeenCalledWith({ path: '/skills', query: { q: 'vue' } })
  })

  it('ignores Enter while an IME composition is active', async () => {
    const wrapper = await mountSearch()
    await wrapper.get('input').trigger('keydown', { key: 'Enter', isComposing: true })
    await flushPromises()
    expect(navigate).not.toHaveBeenCalled()
    expect(wrapper.find('[role="grid"]').exists()).toBe(true)
  })
})
