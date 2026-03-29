const _useKeyboardShortcuts = createSharedComposable(() => {
  const enabled = ref(true)

  if (import.meta.client) {
    watch(enabled, (val) => {
      if (val) {
        delete document.documentElement.dataset.kbdShortcuts
      }
      else {
        document.documentElement.dataset.kbdShortcuts = 'false'
      }
    }, { immediate: true })
  }

  return { enabled }
})

export function useKeyboardShortcuts() {
  return _useKeyboardShortcuts()
}
