export type ClusterFetchStatus = 'idle' | 'pending' | 'success' | 'error'

export type ClusterViewState<T>
  = | { _tag: 'loading' }
    | { _tag: 'not-found' }
    | { _tag: 'error', error: unknown }
    | { _tag: 'ready', data: T }

function readStatusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null)
    return undefined

  const statusCode = Reflect.get(error, 'statusCode')
  if (typeof statusCode === 'number')
    return statusCode

  const status = Reflect.get(error, 'status')
  return typeof status === 'number' ? status : undefined
}

export function resolveClusterViewState<T>(input: {
  data: T | null | undefined
  error: unknown
  status: ClusterFetchStatus
}): ClusterViewState<T> {
  if (input.data)
    return { _tag: 'ready', data: input.data }
  if (readStatusCode(input.error) === 404)
    return { _tag: 'not-found' }
  if (input.status === 'error' || input.error != null)
    return { _tag: 'error', error: input.error }
  return { _tag: 'loading' }
}
