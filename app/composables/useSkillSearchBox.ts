import type { SearchRow } from './useSkillSearch'
import { classifySearchQuery } from '#shared/skill-search-query'
import { searchCellId, searchResultsRoute } from './useSkillSearch'

/** The id the panel's grid takes, so every input points at the same element. */
export const SEARCH_GRID_ID = 'skill-search-grid'

/**
 * One search box: the keyboard model, selection, and navigation shared by the
 * homepage hero box and the header box. Both read and write the one shared
 * search state, so a box only adds how it is driven.
 *
 * The panel is a grid: each row is one cell, and a Skill row has a second cell
 * holding its run chip. Up and down move between rows. Left and right move
 * between a Skill and its run chip, once a row is selected with the keyboard.
 * Enter opens the row, or copies the run command from the chip cell. Enter
 * with no keyboard selection submits the query, so results that arrive under
 * the pointer can never be opened by accident.
 */
export function useSkillSearchBox(options: { inputs: () => (HTMLInputElement | null | undefined)[] }) {
  const search = useSkillSearch()
  const {
    trimmedQuery,
    state,
    open,
    rows,
    activeIndex,
    activeColumn,
    activeRow,
    close,
    reset,
    rememberQuery,
    loadTypeaheadIndex,
    submitRepository,
    findForTask,
  } = search

  const keyboardSelection = ref(false)
  const pendingRepositoryQuery = ref<string | null>(null)

  watch([trimmedQuery, open], ([term, visible]) => {
    if (!visible || term !== pendingRepositoryQuery.value)
      pendingRepositoryQuery.value = null
  }, { flush: 'sync' })

  watch(state, (current) => {
    if (pendingRepositoryQuery.value === null || current._tag === 'loading')
      return
    pendingRepositoryQuery.value = null
    if (current._tag !== 'error')
      submitQuery()
  })

  function clearSelection(): void {
    keyboardSelection.value = false
    activeIndex.value = -1
    activeColumn.value = 0
  }

  watch([trimmedQuery, rows], clearSelection, { flush: 'sync', immediate: true })
  watch(open, (visible) => {
    if (!visible)
      clearSelection()
  }, { flush: 'sync' })

  function openPanel(): void {
    if (!open.value)
      clearSelection()
    open.value = true
    void loadTypeaheadIndex()
  }

  function dismiss(): void {
    close()
    for (const input of options.inputs())
      input?.blur()
  }

  async function goToResults(): Promise<void> {
    const term = trimmedQuery.value
    rememberQuery(term)
    dismiss()
    await navigateTo(searchResultsRoute(term))
  }

  async function select(row: SearchRow): Promise<void> {
    if (row._tag === 'index') {
      await submitRepository(row.repository)
      return
    }
    if (row._tag === 'all') {
      await goToResults()
      return
    }
    // Task search answers inside the panel, so the panel stays open.
    if (row._tag === 'task') {
      await findForTask()
      return
    }
    if (state.value._tag !== 'repository')
      rememberQuery(trimmedQuery.value)
    dismiss()
    reset()
    await navigateTo(row._tag === 'repository' ? row.repository.registryPath : row.skill.registryPath)
  }

  function submitQuery(): void {
    const current = state.value
    // Enter can beat the debounced lookup. Keep repository intent until it answers.
    if (current._tag === 'loading' && classifySearchQuery(trimmedQuery.value)._tag === 'repository') {
      openPanel()
      pendingRepositoryQuery.value = trimmedQuery.value
      return
    }
    if (current._tag === 'repository') {
      if (current.status._tag === 'idle')
        void submitRepository(current.repository)
      return
    }
    // A Repository the registry holds opens its page, the answer the query asked for.
    if (current._tag === 'ready' && current.repository) {
      const row = current.rows[0]
      if (row)
        void select(row)
      return
    }
    void goToResults()
  }

  function copyRunCommand(index: number): void {
    // The run chip owns the copy and its analytics. The keyboard presses its button.
    document.getElementById(searchCellId(index, 1))?.querySelector('button')?.click()
  }

  function isComposing(event: KeyboardEvent): boolean {
    return event.isComposing || event.keyCode === 229
  }

  function onEnter(event: KeyboardEvent): void {
    if (isComposing(event))
      return
    event.preventDefault()
    if (open.value && keyboardSelection.value && activeRow.value) {
      if (activeColumn.value === 1 && activeRow.value._tag === 'skill') {
        copyRunCommand(activeIndex.value)
        return
      }
      void select(activeRow.value)
      return
    }
    submitQuery()
  }

  function onArrow(event: KeyboardEvent, delta: number): void {
    if (isComposing(event))
      return
    event.preventDefault()
    openPanel()
    const count = rows.value.length
    if (!count)
      return
    const column = activeColumn.value
    activeIndex.value = keyboardSelection.value && activeIndex.value >= 0
      ? (activeIndex.value + delta + count) % count
      : delta > 0 ? 0 : count - 1
    activeColumn.value = rows.value[activeIndex.value]?._tag === 'skill' ? column : 0
    keyboardSelection.value = true
  }

  /** Left and right move the caret until a row is selected with the keyboard. */
  function onColumn(event: KeyboardEvent, column: 0 | 1): void {
    if (isComposing(event) || !open.value || !keyboardSelection.value || activeRow.value?._tag !== 'skill')
      return
    event.preventDefault()
    activeColumn.value = column
  }

  const gridId = computed(() => (open.value && rows.value.length ? SEARCH_GRID_ID : undefined))
  const activeDescendant = computed(() =>
    open.value && keyboardSelection.value && activeRow.value
      ? searchCellId(activeIndex.value, activeRow.value._tag === 'skill' ? activeColumn.value : 0)
      : undefined,
  )

  return {
    ...search,
    keyboardSelection,
    openPanel,
    dismiss,
    goToResults,
    select,
    submitQuery,
    onEnter,
    onArrow,
    onColumn,
    gridId,
    activeDescendant,
  }
}
