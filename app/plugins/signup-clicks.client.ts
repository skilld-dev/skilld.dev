import { useEventListener } from '@vueuse/core'
import { signupClickEvent } from '#shared/signup-analytics'

export default defineNuxtPlugin(() => {
  const recordSignup = useSignupEvents()
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
