// Loop 2 mutations (watch and email settings) used to swallow their errors,
// so a failed save looked identical to a successful one: the dialog closed, the
// refresh returned the old values, and the user assumed it stuck. This turns a
// rejection into a visible toast and a logged reason, while still returning null
// so callers keep their existing "did it work?" checks.
export function useActionFailure() {
  const toast = useToast()
  const failureIds = useState<Record<string, string | number>>('action-failure-toasts', () => ({}))
  const clear = (action: string, scope = action) => {
    const id = failureIds.value[scope]
    if (id === undefined)
      return
    const { [scope]: _removed, ...remaining } = failureIds.value
    failureIds.value = remaining
    toast.remove(id)
  }
  const failure = (action: string, scope = action) => (error: unknown): null => {
    const reason = error instanceof Error ? error.message : String(error)
    console.warn(`[action:${action}] ${reason}`)
    clear(action, scope)
    // Nuxt UI defers removal, so each failure needs a fresh generated ID.
    const added = toast.add({
      title: `Could not ${action}`,
      description: 'Something went wrong. Your change was not saved, so try again.',
      color: 'error',
      icon: 'i-lucide-alert-circle',
    })
    failureIds.value = { ...failureIds.value, [scope]: added.id }
    return null
  }
  return Object.assign(failure, { clear })
}
