import type { CollectionRecord } from '../../server/utils/atproto/lexicons/collection'

export interface CollectionItem {
  uri: string
  rkey: string
  record: CollectionRecord
}

interface CollectionsResponse {
  collections: CollectionItem[]
  fetchedAt: string
}

export function useCollections(did: MaybeRefOrGetter<string | null | undefined>, options?: { lazy?: boolean }) {
  const resolvedDid = computed(() => toValue(did))

  return useFetch<CollectionsResponse>(
    () => resolvedDid.value ? `/api/collections/${resolvedDid.value}` : null!,
    {
      watch: [resolvedDid],
      lazy: options?.lazy,
    },
  )
}

export function useCollection(did: MaybeRefOrGetter<string>, rkey: MaybeRefOrGetter<string>, options?: { lazy?: boolean }) {
  const resolvedDid = computed(() => toValue(did))
  const resolvedRkey = computed(() => toValue(rkey))

  return useFetch<{ uri: string, cid: string, record: CollectionRecord }>(
    () => `/api/collections/${resolvedDid.value}/${resolvedRkey.value}`,
    { watch: [resolvedDid, resolvedRkey], lazy: options?.lazy },
  )
}
