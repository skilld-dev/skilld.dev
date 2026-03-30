import type { CollectionInput } from '../../server/utils/atproto/lexicons/collection'

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>
    // $fetch wraps server errors in err.data.message
    if (e.data && typeof e.data === 'object') {
      const msg = (e.data as Record<string, unknown>).message
      if (typeof msg === 'string')
        return msg
    }
    if (typeof e.statusMessage === 'string' && e.statusMessage !== 'Server Error')
      return e.statusMessage
    if (typeof e.message === 'string' && e.message !== 'Server Error')
      return e.message
  }
  return fallback
}

export function useCollectionMutations() {
  const publishing = ref(false)
  const deleting = ref(false)
  const error = ref<string | null>(null)

  async function publish(input: CollectionInput, options?: { shareOnBluesky?: boolean }) {
    publishing.value = true
    error.value = null
    return $fetch('/api/collections', {
      method: 'PUT',
      body: { ...input, shareOnBluesky: options?.shareOnBluesky },
    })
      .catch((err: unknown) => {
        error.value = extractErrorMessage(err, 'Failed to publish collection. Please try again.')
        throw err
      })
      .finally(() => { publishing.value = false })
  }

  async function remove(rkey: string) {
    deleting.value = true
    error.value = null
    return $fetch(`/api/collections/${rkey}`, {
      method: 'DELETE',
    })
      .catch((err: unknown) => {
        error.value = extractErrorMessage(err, 'Failed to delete collection. Please try again.')
        throw err
      })
      .finally(() => { deleting.value = false })
  }

  return { publish, remove, publishing, deleting, error }
}
