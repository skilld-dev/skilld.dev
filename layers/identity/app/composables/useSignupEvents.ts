import type { SignupBrowserEvent } from '#shared/signup-analytics'

export function useSignupEvents() {
  const { loggedIn } = useUserSession()
  return (body: SignupBrowserEvent): void => {
    if (!loggedIn.value)
      return
    // Keep the action independent of analytics and survive same-tab redirects.
    void $fetch('/api/events/signup', { method: 'POST', body, retry: false, keepalive: true }).catch(() => {
      console.warn('[signup-analytics] Could not record signup event')
    })
  }
}
