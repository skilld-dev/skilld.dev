/**
 * Consumes a post-auth intent set in sessionStorage before the auth round-trip.
 * Currently supports: `new-collection` -> /collections/new.
 */
export default defineNuxtPlugin(() => {
  const { isAuthenticated, user } = useAuth()

  watch([isAuthenticated, () => user.value?.handle], async ([authed, handle]) => {
    if (!authed || !handle)
      return
    const intent = sessionStorage.getItem('skilld:post-auth-intent')
    if (!intent)
      return
    sessionStorage.removeItem('skilld:post-auth-intent')
    if (intent === 'new-collection')
      await navigateTo(`/people/${handle}/collections/new`)
  }, { immediate: true })
})
