interface SaveItem {
  uri: string
  rkey: string
  subject: { uri: string, cid: string }
  createdAt: string
}

interface SavesResponse {
  saves: SaveItem[]
}

export const useSavedCollections = createSharedComposable(() => {
  const { isAuthenticated } = useAuth()

  const { data, refresh, status } = useFetch<SavesResponse>('/api/collections/saves', {
    server: false,
    immediate: false,
    watch: [isAuthenticated],
    default: () => ({ saves: [] }),
  })

  // Auto-fetch when authenticated
  watch(isAuthenticated, (authed) => {
    if (authed)
      refresh()
  }, { immediate: true })

  const savedUris = computed(() =>
    new Set(data.value.saves.map(s => s.subject.uri)),
  )

  function isSaved(collectionUri: string) {
    return savedUris.value.has(collectionUri)
  }

  async function save(subject: { uri: string, cid: string }) {
    if (savedUris.value.has(subject.uri))
      return

    // Optimistic: add to local state
    data.value.saves.push({
      uri: '',
      rkey: '',
      subject,
      createdAt: new Date().toISOString(),
    })

    await $fetch('/api/collections/saves', {
      method: 'PUT',
      body: { subject },
    }).catch(() => {
      // Rollback on failure
      data.value.saves = data.value.saves.filter(s => s.subject.uri !== subject.uri)
    })

    await refresh()
  }

  async function unsave(subjectUri: string) {
    const prev = [...data.value.saves]

    // Optimistic remove
    data.value.saves = data.value.saves.filter(s => s.subject.uri !== subjectUri)

    await $fetch('/api/collections/saves', {
      method: 'DELETE',
      body: { subjectUri },
    }).catch(() => {
      // Rollback on failure
      data.value.saves = prev
    })
  }

  return { saves: data, isSaved, save, unsave, refresh, isLoading: computed(() => status.value === 'pending') }
})
