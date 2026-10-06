import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { injectHead, useNuxtApp } from '#imports'
import GithubBadgePage from '../../app/pages/brand-kit/github-badge.vue'

describe('github badge brand kit', () => {
  it('keeps the preview color picker inside the README preview', async () => {
    const wrapper = await mountSuspended(GithubBadgePage)

    expect(wrapper.find('[aria-label="GitHub theme preview"]').exists()).toBe(false)
    expect(wrapper.get('[aria-label="README preview color"]').exists()).toBe(true)

    await wrapper.get('button[aria-label="Preview dark badge"]').trigger('click')
    await nextTick()

    expect(wrapper.get('.github-readme').attributes('data-github-theme')).toBe('dark')
  })

  it('stays out of the index because it is a tool page, not a target', async () => {
    await mountSuspended(GithubBadgePage)
    const head = useNuxtApp().vueApp.runWithContext(() => injectHead())
    const robots = [...head.entries.values()]
      .flatMap(entry => (entry.input as { meta?: Array<{ name?: string, content?: string }> }).meta ?? [])
      .filter(meta => meta.name === 'robots')
      .map(meta => meta.content)

    expect([...new Set(robots)]).toEqual(['noindex,follow'])
  })
})
