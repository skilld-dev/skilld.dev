import type { SkillBoxSearchAnswer } from '#layers/registry/server/presenters/skill-box-search'
import type { TaskSearchAnswer } from '#layers/registry/server/presenters/task-search'
import type { GitHubRepository } from '#shared/github-repository'
import type {
  IndexedRepositorySkill,
  RepositoryIndexProgress,
  RepositoryIndexStatusResponse,
  SubmitRepositoryIndexResponse,
} from '#shared/repository-index'
import type { SkillSearchQuery } from '#shared/skill-search-query'
import type { IndexedSkillsLikeResult } from '../utils/repository-index-likes'
import type { TypeaheadHit, TypeaheadRepository, TypeaheadTuple } from '../utils/skill-typeahead'
import { createSharedComposable, promiseTimeout, useLocalStorage, watchDebounced } from '@vueuse/core'
import { classifySearchQuery } from '#shared/skill-search-query'
import { indexGitHubRepository } from '../utils/repository-index'
import { likeIndexedSkills } from '../utils/repository-index-likes'
import { matchTypeahead, matchTypeaheadRepositories } from '../utils/skill-typeahead'

/** Debounce before hitting the network. Local hits render with no delay. */
const QUERY_DEBOUNCE_MS = 180
/**
 * A sentence waits a little longer. Each pause mid-sentence would otherwise
 * ask the server to understand a half-typed request.
 */
const INTENT_DEBOUNCE_MS = 350
const RESULT_LIMIT = 6
const REPOSITORY_LIMIT = 2
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
  registryPath: string
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

/** A Repository in the registry. Its row opens the Repository page. */
export type SearchRepository = TypeaheadRepository

/**
 * Task search for the sentence in the box. It runs only when the visitor
 * selects its row, never per keystroke. Every status but `found` leaves the
 * search results on screen.
 */
export type TaskSearchStatus
  = | { _tag: 'idle' }
    | { _tag: 'running' }
    | { _tag: 'found', skills: SearchSkill[] }
    | { _tag: 'none' }
    | { _tag: 'limited', scope: 'visitor' | 'daily' }
    | { _tag: 'off' }
    | { _tag: 'failed' }

/**
 * A row the user can move focus onto. Keeping the trailing "see everything"
 * action in the same list as the results means one arrow-key model covers the
 * whole panel instead of two.
 *
 * `repository` is a Repository the registry holds. `index` is the action for
 * one it does not hold yet. `task` runs task search, and then shows how it went.
 */
export type SearchRow
  = | { _tag: 'skill', skill: SearchSkill, provisional: boolean }
    | { _tag: 'repository', repository: SearchRepository }
    | { _tag: 'index', repository: GitHubRepository }
    | { _tag: 'all', query: string }
    | { _tag: 'task', status: Exclude<TaskSearchStatus, { _tag: 'found' }> }

/**
 * Which retrieval lanes answered. `semantic` means the lexical lane found
 * nothing at all: no skill contains the typed words, and every result is a
 * by-meaning neighbour. The panel says so rather than presenting them with the
 * same confidence as a real match.
 */
export type SearchMode = 'hybrid' | 'lexical' | 'semantic'

export type RepositorySearchStatus
  = | { _tag: 'idle' }
    | { _tag: 'pending', progress: RepositoryIndexProgress }
    | { _tag: 'indexed', skills: IndexedRepositorySkill[] }
    | { _tag: 'error', reason: string }

export type RepositoryLikeStatus
  = | { _tag: 'pending' }
    | IndexedSkillsLikeResult

export type RepositoryIndexTask
  = | { _tag: 'idle' }
    | { _tag: 'indexing', repository: GitHubRepository, progress: RepositoryIndexProgress }
    | {
      _tag: 'indexed'
      repository: GitHubRepository
      skills: IndexedRepositorySkill[]
      likes: RepositoryLikeStatus
    }
    | { _tag: 'failed', repository: GitHubRepository, reason: string }

/**
 * `ready.repository` is set when the query named a Repository the registry
 * holds. `repository` is the index flow for one it does not hold yet.
 */
export type SearchState
  = | { _tag: 'empty' }
    | { _tag: 'loading', rows: SearchRow[] }
    | { _tag: 'ready', rows: SearchRow[], total: number, mode?: SearchMode, repository: SearchRepository | null }
    | { _tag: 'error', error: unknown }
    | {
      _tag: 'repository'
      repository: GitHubRepository
      status: RepositorySearchStatus
      rows: SearchRow[]
    }

function hitToSkill(hit: TypeaheadHit): SearchSkill {
  return {
    name: hit.name,
    owner: hit.owner,
    repo: hit.repo,
    slug: `${hit.owner}/${hit.name}`,
    registryPath: hit.registryPath,
    stars: hit.stars,
  }
}

function skillKey(skill: Pick<SearchSkill, 'owner' | 'repo' | 'name'>): string {
  return `${skill.owner}/${skill.repo}/${skill.name}`
}

/** The text the local Repository index matches: a name, or a login without its `@`. */
function repositoryMatchText(query: SkillSearchQuery): string {
  if (query._tag === 'name')
    return query.text
  if (query._tag === 'owner')
    return query.login
  return ''
}

/**
 * Where "See all results" goes. A sentence keeps the semantic lane on
 * `/skills`, so the full list answers the way the panel did.
 */
export function searchResultsRoute(term: string): { path: '/skills', query?: Record<string, string> } {
  const query = classifySearchQuery(term)
  if (query._tag === 'empty')
    return { path: '/skills' }
  if (query._tag === 'owner')
    return { path: '/skills', query: { owner: query.login } }
  if (query._tag === 'intent')
    return { path: '/skills', query: { q: term, ai: '1' } }
  return { path: '/skills', query: { q: term } }
}

/** The DOM id of one grid cell, shared by the panel and the combobox. */
export function searchCellId(index: number, column: 0 | 1): string {
  return column === 0 ? `skill-search-row-${index}` : `skill-search-row-${index}-run`
}

function useSkillSearchInternal() {
  const { isAuthenticated } = useAuth()
  const { ensureLiked } = useLikes()
  const query = ref('')
  const open = ref(false)
  /** The highlighted row, or -1 for none. Set by the arrow keys or the pointer. */
  const activeIndex = ref(-1)
  /** 0 is the row itself, 1 its run chip. Only Skill rows have a run chip. */
  const activeColumn = ref<0 | 1>(0)

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
  const classified = computed(() => classifySearchQuery(trimmedQuery.value))
  const repository = computed<GitHubRepository | null>(() =>
    classified.value._tag === 'repository' ? classified.value.repository : null,
  )
  const repositoryTask = shallowRef<RepositoryIndexTask>({ _tag: 'idle' })
  const repositoryModalOpen = ref(false)
  let repositoryAttempt = 0

  function statusForRepository(repositoryValue: GitHubRepository): RepositorySearchStatus {
    const task = repositoryTask.value
    if (task._tag === 'idle' || task.repository.url !== repositoryValue.url)
      return { _tag: 'idle' }
    if (task._tag === 'indexing')
      return { _tag: 'pending', progress: task.progress }
    if (task._tag === 'indexed')
      return { _tag: 'indexed', skills: task.skills }
    return { _tag: 'error', reason: task.reason }
  }

  /** Repositories the local index matches, for a name or a login. */
  const localRepositoryRows = computed<SearchRow[]>(() =>
    matchTypeaheadRepositories(typeaheadIndex.value, repositoryMatchText(classified.value), REPOSITORY_LIMIT)
      .map(match => ({ _tag: 'repository', repository: match })),
  )

  /** Instant, network-free matches for the query as currently typed. */
  const localRows = computed<SearchRow[]>(() => {
    const kind = classified.value._tag
    if (kind === 'repository' || kind === 'empty')
      return []
    const skills = matchTypeahead(typeaheadIndex.value, kind === 'owner' ? '' : trimmedQuery.value, RESULT_LIMIT)
      .map(hit => ({ _tag: 'skill' as const, skill: hitToSkill(hit), provisional: true }))
    return [...localRepositoryRows.value, ...skills]
  })

  const serverResults = shallowRef<SkillBoxSearchAnswer | null>(null)
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
      const res = await $fetch<SkillBoxSearchAnswer>('/api/skills/search', {
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

  watchDebounced(trimmedQuery, (term) => {
    void runSearch(term)
  }, {
    debounce: () => classified.value._tag === 'intent' ? INTENT_DEBOUNCE_MS : QUERY_DEBOUNCE_MS,
    flush: 'sync',
  })

  const taskSearch = shallowRef<TaskSearchStatus>({ _tag: 'idle' })
  let taskInFlight: AbortController | null = null

  /**
   * Run task search for the sentence in the box. It takes about 5 seconds,
   * so it starts only from its row. Any failure keeps the search results.
   */
  async function findForTask(): Promise<void> {
    const status = taskSearch.value._tag
    if (classified.value._tag !== 'intent' || (status !== 'idle' && status !== 'failed'))
      return
    const controller = new AbortController()
    taskInFlight = controller
    taskSearch.value = { _tag: 'running' }
    try {
      const answer = await $fetch<TaskSearchAnswer>('/api/skills/task-search', {
        method: 'POST',
        body: { q: trimmedQuery.value },
        signal: controller.signal,
      })
      if (controller.signal.aborted)
        return
      taskSearch.value = answer._tag === 'found' ? { _tag: 'found', skills: answer.items } : answer
    }
    catch (error) {
      // An edit to the query aborts the request; the new query starts idle.
      if (controller.signal.aborted)
        return
      console.warn('[search] task search unavailable', error)
      taskSearch.value = { _tag: 'failed' }
    }
    finally {
      if (taskInFlight === controller)
        taskInFlight = null
    }
  }

  // Invalidate on input, before debounce. Old results must never remain selectable.
  watch(trimmedQuery, () => {
    activeIndex.value = -1
    activeColumn.value = 0
    inFlight?.abort()
    inFlight = null
    serverResults.value = null
    serverError.value = null
    pending.value = false
    taskInFlight?.abort()
    taskInFlight = null
    taskSearch.value = { _tag: 'idle' }
  }, { flush: 'sync' })

  const state = computed<SearchState>(() => {
    const term = trimmedQuery.value
    if (!term)
      return { _tag: 'empty' }

    // A Repository being indexed from this box shows its progress, whatever
    // the server said about it before the index started.
    const repositoryValue = repository.value
    const status = repositoryValue ? statusForRepository(repositoryValue) : null
    if (repositoryValue && status && status._tag !== 'idle') {
      return {
        _tag: 'repository',
        repository: repositoryValue,
        status,
        rows: status._tag === 'indexed'
          ? status.skills.map(skill => ({
              _tag: 'skill' as const,
              provisional: false,
              skill: {
                name: skill.name,
                owner: repositoryValue.owner,
                repo: repositoryValue.repo,
                slug: skill.slug,
                registryPath: skill.registryPath,
              },
            }))
          : [],
      }
    }

    if (serverError.value)
      return { _tag: 'error', error: serverError.value }

    const server = serverResults.value
    if (!server || pending.value) {
      // Show local matches while the server catches up so the panel never
      // flashes empty mid-type.
      return { _tag: 'loading', rows: localRows.value }
    }

    const skillRows: SearchRow[] = server.items
      .map(skill => ({ _tag: 'skill' as const, skill, provisional: false }))

    if (server.repository?._tag === 'not-indexed') {
      const { owner, repo, url } = server.repository
      const target: GitHubRepository = repositoryValue ?? { _tag: 'repository', owner, repo, url }
      return {
        _tag: 'repository',
        repository: target,
        status: { _tag: 'idle' },
        rows: [{ _tag: 'index', repository: target }, ...skillRows],
      }
    }

    if (server.repository?._tag === 'indexed') {
      const { owner, repo, stars, skillCount, registryPath } = server.repository
      const repositoryRow: SearchRepository = { owner, repo, stars, skillCount, registryPath }
      // A Repository with one Skill is that Skill, and only the Skill row
      // carries the run command. Enter then opens the Skill.
      const isSkill = (row: SearchRow) => row._tag === 'skill'
        && row.skill.owner.toLowerCase() === owner.toLowerCase()
        && row.skill.repo.toLowerCase() === repo.toLowerCase()
      const leadRows: SearchRow[] = skillCount === 1 && skillRows.some(isSkill)
        ? []
        : [{ _tag: 'repository', repository: repositoryRow }]
      return {
        _tag: 'ready',
        rows: [...leadRows, ...skillRows],
        total: skillCount,
        repository: repositoryRow,
      }
    }

    // A sentence can ask task search for Skills that fit. Found Skills take the
    // search results' place; every other status leaves them where they are.
    const task = taskSearch.value
    if (server.kind === 'intent' && task._tag === 'found') {
      const taskRows: SearchRow[] = task.skills.map(skill => ({ _tag: 'skill' as const, skill, provisional: false }))
      return { _tag: 'ready', rows: [...taskRows, { _tag: 'all', query: term }], total: server.total, repository: null }
    }

    const rows: SearchRow[] = [...localRepositoryRows.value, ...skillRows]
    if (skillRows.length)
      rows.push({ _tag: 'all', query: term })
    if (server.kind === 'intent' && task._tag !== 'found')
      rows.push({ _tag: 'task', status: task })
    return { _tag: 'ready', rows, total: server.total, mode: server.mode ?? undefined, repository: null }
  })

  const rows = computed<SearchRow[]>(() =>
    state.value._tag === 'ready'
    || state.value._tag === 'loading'
    || state.value._tag === 'repository'
      ? state.value.rows
      : [],
  )

  watch(rows, (next) => {
    if (activeIndex.value > next.length - 1)
      activeIndex.value = next.length - 1
  })

  const activeRow = computed<SearchRow | null>(() => rows.value[activeIndex.value] ?? null)

  function move(delta: number): void {
    const count = rows.value.length
    if (!count)
      return
    activeIndex.value = activeIndex.value < 0
      ? (delta > 0 ? 0 : count - 1)
      : (activeIndex.value + delta + count) % count
    if (rows.value[activeIndex.value]?._tag !== 'skill')
      activeColumn.value = 0
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
    activeIndex.value = -1
    activeColumn.value = 0
  }

  async function submitRepository(repositoryValue: GitHubRepository): Promise<void> {
    const attempt = ++repositoryAttempt
    repositoryTask.value = {
      _tag: 'indexing',
      repository: repositoryValue,
      progress: { _tag: 'queued' },
    }
    repositoryModalOpen.value = true
    open.value = false
    query.value = ''
    const result = await indexGitHubRepository(repositoryValue, {
      // Both calls name their response type. Letting nitro infer it from the
      // route blows the instantiation depth limit (TS2321) now that the route
      // table is large, and these responses are already modelled in
      // #shared/repository-index.
      submit: repositoryInput => $fetch<SubmitRepositoryIndexResponse>('/api/repos', {
        method: 'POST',
        body: { url: repositoryInput.url },
      }),
      status: jobId => $fetch<RepositoryIndexStatusResponse>(`/api/repos/index/${encodeURIComponent(jobId)}`),
      wait: () => promiseTimeout(1500),
      onProgress: (progress) => {
        if (attempt === repositoryAttempt) {
          repositoryTask.value = {
            _tag: 'indexing',
            repository: repositoryValue,
            progress,
          }
        }
      },
    }).catch((error) => {
      console.warn('[search] repository indexing unavailable', error)
      return {
        _tag: 'failed' as const,
        repository: repositoryValue,
        reason: 'Couldn\'t index this repository. Check your connection and try again.',
      }
    })
    if (attempt !== repositoryAttempt)
      return

    if (result._tag !== 'indexed') {
      repositoryTask.value = {
        _tag: 'failed',
        repository: repositoryValue,
        reason: result._tag === 'failed'
          ? result.reason
          : 'Repository indexing is taking longer than expected. Try again shortly.',
      }
      return
    }

    repositoryTask.value = {
      _tag: 'indexed',
      repository: repositoryValue,
      skills: result.skills,
      likes: isAuthenticated.value ? { _tag: 'pending' } : { _tag: 'anonymous' },
    }
    const likes = await likeIndexedSkills(repositoryValue, result.skills, {
      authenticated: isAuthenticated.value,
      ensureLiked,
    })
    if (attempt !== repositoryAttempt)
      return
    repositoryTask.value = {
      _tag: 'indexed',
      repository: repositoryValue,
      skills: result.skills,
      likes,
    }
  }

  return {
    query,
    trimmedQuery,
    open,
    repositoryModalOpen,
    repositoryTask,
    classified,
    state,
    rows,
    activeIndex,
    activeColumn,
    activeRow,
    recentSearches,
    move,
    close,
    reset,
    rememberQuery,
    loadTypeaheadIndex,
    retry: () => runSearch(trimmedQuery.value),
    submitRepository,
    taskSearch,
    findForTask,
    skillKey,
  }
}

/**
 * Shared so the header trigger and the panel operate on one state. Two
 * independent instances would mean the panel could not read what the input
 * holds.
 */
export const useSkillSearch = createSharedComposable(useSkillSearchInternal)
