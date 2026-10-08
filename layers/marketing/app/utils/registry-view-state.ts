import type { GitHubRepository } from '#shared/github-repository'
import { classifySearchQuery } from '#shared/skill-search-query'

export type RegistryFetchStatus = 'idle' | 'pending' | 'success' | 'error'

/** An empty repository search offers the same index flow as the search box. */
export function repositorySearchFallback(query: string, status: RegistryFetchStatus, total: number | undefined): GitHubRepository | null {
  if (status !== 'success' || total !== 0)
    return null
  const classified = classifySearchQuery(query)
  return classified._tag === 'repository' ? classified.repository : null
}

export type RegistryViewState<T extends { items: readonly unknown[] }>
  = | { _tag: 'loading' }
    | { _tag: 'error', error: unknown }
    | { _tag: 'ready', data: T }

export function resolveRegistryViewState<T extends { items: readonly unknown[] }>(input: {
  data: T | null | undefined
  error: unknown
  status: RegistryFetchStatus
}): RegistryViewState<T> {
  if (input.data)
    return { _tag: 'ready', data: input.data }
  if (input.status === 'error' || input.error != null)
    return { _tag: 'error', error: input.error }
  return { _tag: 'loading' }
}

export function isInputFocused(
  activeElement: Element | null | undefined,
  input: HTMLInputElement | null | undefined,
): boolean {
  return input != null && activeElement === input
}
