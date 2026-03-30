import { useLocalStorage } from '@vueuse/core'

export type OnboardingStage = 'browse' | 'connected' | 'published' | 'curator'

export const PERSONAL_COLLECTION_SLUG = 'skills'

export const useOnboarding = createSharedComposable(() => {
  const { user, isAuthenticated } = useAuth()
  const did = computed(() => user.value?.did)
  const { data: collectionsData } = useCollections(did)

  const dismissedTips = useLocalStorage<string[]>('skilld:dismissed-tips', [])
  const justSignedIn = useState('skilld:just-signed-in', () => false)

  const collections = computed(() => collectionsData.value?.collections ?? [])
  const collectionCount = computed(() => collections.value.length)

  const personalCollection = computed(() =>
    collections.value.find(c => c.rkey === PERSONAL_COLLECTION_SLUG),
  )
  const hasPersonalCollection = computed(() => !!personalCollection.value)

  const namedCollections = computed(() =>
    collections.value.filter(c => c.rkey !== PERSONAL_COLLECTION_SLUG),
  )

  const stage = computed<OnboardingStage>(() => {
    if (!isAuthenticated.value)
      return 'browse'
    if (!hasPersonalCollection.value)
      return 'connected'
    if (collectionCount.value >= 3)
      return 'curator'
    return 'published'
  })

  const allUnlocked = computed(() => dismissedTips.value.includes('__all_unlocked__'))

  function dismissTip(id: string) {
    if (!dismissedTips.value.includes(id))
      dismissedTips.value = [...dismissedTips.value, id]
  }

  function isTipDismissed(id: string) {
    return allUnlocked.value || dismissedTips.value.includes(id)
  }

  function unlockAll() {
    dismissedTips.value = [...dismissedTips.value, '__all_unlocked__']
  }

  function consumeJustSignedIn() {
    const val = justSignedIn.value
    justSignedIn.value = false
    return val
  }

  return {
    stage,
    collectionCount,
    personalCollection,
    hasPersonalCollection,
    namedCollections,
    justSignedIn,
    consumeJustSignedIn,
    dismissTip,
    isTipDismissed,
    allUnlocked,
    unlockAll,
  }
})
