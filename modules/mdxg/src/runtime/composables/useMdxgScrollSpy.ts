import type { Ref } from 'vue'
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

// Tracks the topmost visible heading id from a list. Returns a reactive ref
// holding the active id (or '' when nothing is in view yet).
// Re-binds when `ids` changes (e.g. on virtual-page navigation).
export function useMdxgScrollSpy(ids: Ref<string[]>) {
  const active = ref<string>('')
  let observer: IntersectionObserver | null = null
  const visible = new Set<string>()

  function teardown() {
    observer?.disconnect()
    observer = null
    visible.clear()
  }

  function pickActive(elements: HTMLElement[]) {
    if (!visible.size) {
      // Nothing in the upper viewport — keep showing whatever was last set,
      // but fall back to the first heading above the fold on first run.
      if (!active.value && elements[0])
        active.value = elements[0].id
      return
    }
    // Topmost visible element wins so the outline tracks reading position
    // even when several headings are simultaneously in view.
    for (const el of elements) {
      if (visible.has(el.id)) {
        active.value = el.id
        return
      }
    }
  }

  async function setup() {
    teardown()
    await nextTick()
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined')
      return
    const elements = ids.value
      .map(id => document.getElementById(id))
      .filter((e): e is HTMLElement => !!e)
    if (!elements.length) {
      active.value = ''
      return
    }
    active.value = ''
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).id
        if (entry.isIntersecting)
          visible.add(id)
        else
          visible.delete(id)
      }
      pickActive(elements)
    }, {
      // Bias toward "currently being read": ignore headings still near the
      // bottom of the viewport so the active item flips when the heading
      // crosses the upper third.
      rootMargin: '0px 0px -66% 0px',
      threshold: [0, 1],
    })
    for (const el of elements)
      observer.observe(el)
  }

  watch(ids, setup, { immediate: true, flush: 'post' })
  onBeforeUnmount(teardown)

  return active
}
