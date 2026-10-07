import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
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
})
