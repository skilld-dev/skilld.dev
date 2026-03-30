import type { CollectionInput } from '../../server/utils/atproto/lexicons/collection'

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
      .finally(() => { publishing.value = false })
      .catch((err: Error) => {
        error.value = err.message || 'Failed to publish collection'
        throw err
      })
  }

  async function remove(rkey: string) {
    deleting.value = true
    error.value = null
    return $fetch(`/api/collections/${rkey}`, {
      method: 'DELETE',
    })
      .finally(() => { deleting.value = false })
      .catch((err: Error) => {
        error.value = err.message || 'Failed to delete collection'
        throw err
      })
  }

  return { publish, remove, publishing, deleting, error }
}
