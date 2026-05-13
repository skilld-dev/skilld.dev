import type { Ref } from 'vue'
import { nextTick, onBeforeUnmount, watch } from 'vue'

// Enhances `<pre>` blocks inside a region with a copy-to-clipboard button.
// Idempotent: re-runs cleanly when the trigger ref changes (typically the
// active page slug). Pairs with @nuxtjs/mdc's Shiki-highlighted output.
export function useMdxgCodeCopy(root: Ref<HTMLElement | null>, trigger: Ref<unknown>) {
  const cleanups: (() => void)[] = []

  function decorate() {
    teardown()
    const el = root.value
    if (!el)
      return
    const blocks = el.querySelectorAll<HTMLPreElement>('pre')
    blocks.forEach((pre) => {
      if (pre.dataset.mdxgEnhanced)
        return
      pre.dataset.mdxgEnhanced = '1'
      const btn = window.document.createElement('button')
      btn.type = 'button'
      btn.className = 'mdxg-copy'
      btn.setAttribute('aria-label', 'Copy code')
      btn.textContent = 'Copy'
      const handler = async () => {
        const code = pre.querySelector('code')?.textContent ?? ''
        try {
          await navigator.clipboard.writeText(code)
          btn.textContent = 'Copied'
          setTimeout(() => { btn.textContent = 'Copy' }, 1500)
        }
        catch {
          btn.textContent = 'Failed'
          setTimeout(() => { btn.textContent = 'Copy' }, 1500)
        }
      }
      btn.addEventListener('click', handler)
      pre.appendChild(btn)
      cleanups.push(() => {
        btn.removeEventListener('click', handler)
        btn.remove()
        delete pre.dataset.mdxgEnhanced
      })
    })
  }

  function teardown() {
    while (cleanups.length) cleanups.pop()!()
  }

  watch(trigger, async () => {
    await nextTick()
    decorate()
  }, { immediate: true, flush: 'post' })

  onBeforeUnmount(teardown)
}
