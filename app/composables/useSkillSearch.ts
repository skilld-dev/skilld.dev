import type { TypeaheadHit, TypeaheadTuple } from '../utils/skill-typeahead'
import { createSharedComposable, refDebounced, useLocalStorage } from '@vueuse/core'
import { matchTypeahead } from '../utils/skill-typeahead'

/** Debounce before hitting the network. Local hits render with no delay. */
const QUERY_DEBOUNCE_MS = 180
const RESULT_LIMIT = 7
const RECENT_LIMIT = 5

export interface SearchAlternateSource {
  owner: string
  repo: string
  slug: string
}

export interface SearchSkill {
  name: string
  owner: string
  repo: string
  slug: string
  description?: string | null
  stars?: number
  official?: boolean
  trustTier?: string
  modifiedAt?: number | null
  pushedAt?: number | null
  /** Present when this row stands in for the same skill mirrored across repos. */
  sourceCount?: number
  alternateSources?: SearchAlternateSource[]
}

/**
 * A row the user can move focus onto. Keeping the trailing "see everything"
 * action in the same list as the results means one arrow-key model covers the
 * whole panel instead of two.
 */
export type SearchRow
  = | { _tag: 'skill', skill: SearchSkill, provisional: boolean }
    | { _tag: 'all', query: string }

/**
 * Which retrieval lanes answered. `semantic` means the lexical lane found
 * nothing at all: no skill contains the typed words, and every result is a
 * by-meaning neighbour. The panel says so rather than presenting them with the
 * same confidence as a real match.
 */
export type SearchMode = 'hybrid' | 'lexical' | 'semantic'

export type SearchState
  = | { _tag: 'empty' }
    | { _tag: 'loading', rows: SearchRow[] }
    | { _tag: 'ready', rows: SearchRow[], total: number, mode?: SearchMode }
    | { _tag: 'error', error: unknown }

interface SkillsResponse {
  items: SearchSkill[]
  total: number
  mode?: SearchMode
}

function hitToSkill(hit: TypeaheadHit): SearchSkill {
  return {
    name: hit.name,
    owner: hit.owner,
    repo: hit.repo,
    slug: `${hit.owner}/${hit.name}`,
    stars: hit.stars,
  }
}

function skillKey(skill: Pick<SearchSkill, 'owner' | 'repo' | 'name'>): string {
  return `${skill.owner}/${skill.repo}/${skill.name}`
}

function useSkillSearchInternal() {
  const query = ref('')
  const open = ref(false)
  const activeIndex = ref(0)
  const debouncedQuery = refDebounced(query, QUERY_DEBOUNCE_MS)

  const recentSearches = useLocalStorage<string[]>('skilld:recent-searches', [])

  // The typeahead index is fetched once, on first open rather than on page
  // load, so it never competes with the page's own content for bandwidth.
  const typeaheadIndex = shallowRef<TypeaheadTuple[]>([])
  const indexRequest = shallowRef<Promise<void> | null>(null)

  function loadTypeaheadIndex(): Promise<void> {
    if (!indexRequest.value) {
      indexRequest.value = $fetch<{ skills: TypeaheadTuple[] }>('/api/skills/typeahead')
        .then((res) => {
          typeaheadIndex.value = res.skills ?? []
        })
        .catch((error) => {
          // Losing the local index costs instant first-keystroke results, not
          // search itself: the server lane still answers every query.
          console.warn('[search] typeahead index unavailable', error)
        })
    }
    return indexRequest.value
  }

  const trimmedQuery = computed(() => query.value.trim())

  /** Instant, network-free matches for the query as currently typed. */
  const localRows = computed<SearchRow[]>(() =>
    matchTypeahead(typeaheadIndex.value, trimmedQuery.value, RESULT_LIMIT)
      .map(hit => ({ _tag: 'skill', skill: hitToSkill(hit), provisional: true })),
  )

  const serverResults = shallowRef<SkillsResponse | null>(null)
  const serverError = shallowRef<unknown>(null)
  const pending = ref(false)
  let inFlight: AbortController | null = null

  async function runSearch(term: string): Promise<void> {
    inFlight?.abort()
    if (!term) {
      serverResults.value = null
      serverError.value = null
      pending.value = false
      return
    }

    const controller = new AbortController()
    inFlight = controller
    pending.value = true
    serverError.value = null

    try {
      const res = await $fetch<SkillsResponse>('/api/skills', {
        query: { q: term, limit: RESULT_LIMIT },
        signal: controller.signal,
      })
      if (controller.signal.aborted)
        return
      serverResults.value = res
    }
    catch (error) {
      // An aborted request is a superseded keystroke, not a failure.
      if (controller.signal.aborted || (error as { name?: string })?.name === 'AbortError')
        return
      serverError.value = error
      serverResults.value = null
    }
    finally {
      if (inFlight === controller) {
        pending.value = false
        inFlight = null
      }
    }
  }

  watch(debouncedQuery, (term) => {
    void runSearch(term.trim())
  })

  // A cleared query should empty the panel immediately rather than waiting out
  // the debounce with stale results still on screen.
  watch(trimmedQuery, (term) => {
    activeIndex.value = 0
    if (!term) {
      inFlight?.abort()
      inFlight = null
      serverResults.value = null
      serverError.value = null
      pending.value = false
    }
  })

  const state = computed<SearchState>(() => {
    const term = trimmedQuery.value
    if (!term)
      return { _tag: 'empty' }

    if (serverError.value)
      return { _tag: 'error', error: serverError.value }

    const server = serverResults.value
    if (!server || pending.value) {
      // Show local matches while the server catches up so the panel never
      // flashes empty mid-type.
      return { _tag: 'loading', rows: localRows.value }
    }

    const rows: SearchRow[] = server.items
      .map(skill => ({ _tag: 'skill' as const, skill, provisional: false }))
    if (rows.length)
      rows.push({ _tag: 'all', query: term })
    return { _tag: 'ready', rows, total: server.total, mode: server.mode }
  })

  const rows = computed<SearchRow[]>(() =>
    state.value._tag === 'ready' || state.value._tag === 'loading' ? state.value.rows : [],
  )

  watch(rows, (next) => {
    if (activeIndex.value > next.length - 1)
      activeIndex.value = Math.max(0, next.length - 1)
  })

  const activeRow = computed<SearchRow | null>(() => rows.value[activeIndex.value] ?? null)

  function move(delta: number): void {
    const count = rows.value.length
    if (!count)
      return
    activeIndex.value = (activeIndex.value + delta + count) % count
  }

  function rememberQuery(term: string): void {
    const value = term.trim()
    if (!value)
      return
    recentSearches.value = [value, ...recentSearches.value.filter(q => q !== value)].slice(0, RECENT_LIMIT)
  }

  function close(): void {
    open.value = false
  }

  function reset(): void {
    query.value = ''
    activeIndex.value = 0
  }

  return {
    query,
    trimmedQuery,
    open,
    state,
    rows,
    activeIndex,
    activeRow,
    recentSearches,
    move,
    close,
    reset,
    rememberQuery,
    loadTypeaheadIndex,
    retry: () => runSearch(trimmedQuery.value),
    skillKey,
  }
}

/**
 * Shared so the header trigger and the panel operate on one state. Two
 * independent instances would mean the panel could not read what the input
 * holds.
 */
export const useSkillSearch = createSharedComposable(useSkillSearchInternal)
