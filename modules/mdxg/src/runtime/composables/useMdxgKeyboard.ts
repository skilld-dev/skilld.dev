import { useEventListener } from '@vueuse/core'

export interface MdxgKeyboardActions {
  next: () => void
  prev: () => void
  focusSearch?: () => void
}

// Global keyboard shortcuts: ←/→ for sequential nav, `/` to focus search.
// No-ops if focus is on an editable element.
export function useMdxgKeyboard(actions: MdxgKeyboardActions) {
  useEventListener('keydown', (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null
    if (target?.matches('input, textarea, [contenteditable=""], [contenteditable="true"]'))
      return
    if (e.key === 'ArrowRight') {
      actions.next()
    }
    else if (e.key === 'ArrowLeft') {
      actions.prev()
    }
    else if (e.key === '/' && actions.focusSearch) {
      e.preventDefault()
      actions.focusSearch()
    }
  })
}
