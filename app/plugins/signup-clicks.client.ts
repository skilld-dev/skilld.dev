import { useEventListener } from '@vueuse/core'
import { signupClickEvent } from '#shared/signup-analytics'

export default defineNuxtPlugin((nuxtApp) => {
  const recordSignup = useSignupEvents()
  const route = useRoute()
  const proof = useState<string | null>('signup-click-proof', () => null)
  let preparedPage = ''
  let expiresAt = 0
  async function prepareProof() {
    const page = route.fullPath
    if (preparedPage === page && expiresAt > Date.now())
      return
    if (![...document.querySelectorAll<HTMLAnchorElement>('a[href]')].some(link => signupClickEvent(link.href, window.location.origin)))
      return
    preparedPage = page
    expiresAt = Date.now() + 240_000
    proof.value = null
    const result = await $fetch<{ proof: string | null }>('/api/events/signup-proof', { retry: false }).catch(() => {
      console.warn('[signup-analytics] Could not prepare click proof')
      return null
    })
    if (route.fullPath === page)
      proof.value = result?.proof ?? null
    if (!result?.proof)
      expiresAt = 0
  }
  nuxtApp.hook('app:mounted', prepareProof)
  nuxtApp.hook('page:finish', prepareProof)
  watch(() => route.fullPath, () => {
    proof.value = null
  })
  useEventListener(document, ['pointerover', 'focusin'], (event) => {
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null
    if (link && signupClickEvent(link.href, window.location.origin))
      void prepareProof()
  })
  useEventListener(document, 'click', (event) => {
    // Page loads, prefetches, and programmatic DOM clicks are not click evidence.
    if (!event.isTrusted || !(event.target instanceof Element))
      return
    const link = event.target.closest<HTMLAnchorElement>('a[href]')
    if (!link)
      return
    const point = signupClickEvent(link.href, window.location.origin)
    if (point)
      recordSignup(point)
  })
})
