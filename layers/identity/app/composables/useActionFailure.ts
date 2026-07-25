// Loop 2 mutations (watch, cadence, digest email) used to swallow their errors,
// so a failed save looked identical to a successful one: the dialog closed, the
// refresh returned the old values, and the user assumed it stuck. This turns a
// rejection into a visible toast and a logged reason, while still returning null
// so callers keep their existing "did it work?" checks.
export function useActionFailure() {
  const toast = useToast()
  return (action: string) => (error: unknown): null => {
    const reason = error instanceof Error ? error.message : String(error)
    console.warn(`[action:${action}] ${reason}`)
    toast.add({
      title: `Could not ${action}`,
      description: 'Something went wrong. Your change was not saved, so try again.',
      color: 'error',
      icon: 'i-lucide-alert-circle',
    })
    return null
  }
}
