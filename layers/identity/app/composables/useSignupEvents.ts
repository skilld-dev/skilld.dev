import type { SignupBrowserEvent } from '#shared/signup-analytics'

export function useSignupEvents() {
  const { loggedIn } = useUserSession()
  const proof = useState<string | null>('signup-click-proof', () => null)
  return (body: SignupBrowserEvent): void => {
    if (!loggedIn.value && body.stage !== 'oauth')
      return
    if (body.stage === 'oauth' && !proof.value)
      return
    const headers = body.stage === 'oauth' ? { 'x-signup-proof': proof.value! } : undefined
    if (body.stage === 'oauth')
      proof.value = null
    // Keep the action independent of analytics and survive same-tab redirects.
    void $fetch('/api/events/signup', { method: 'POST', body, headers, retry: false, keepalive: true }).catch(() => {
      console.warn('[signup-analytics] Could not record signup event')
    })
  }
}
