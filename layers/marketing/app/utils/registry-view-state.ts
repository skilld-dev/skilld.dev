export type RegistryFetchStatus = 'idle' | 'pending' | 'success' | 'error'

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
