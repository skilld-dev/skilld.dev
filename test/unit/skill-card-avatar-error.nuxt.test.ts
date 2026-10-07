import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it } from 'vitest'
import SkillCard from '../../app/components/SkillCard.vue'

const skill = { owner: 'gone-owner', repo: 'skills', name: 'vite', registryPath: '/gh/gone-owner/skills/vite' }

const prototype = HTMLImageElement.prototype
const original = {
  complete: Object.getOwnPropertyDescriptor(prototype, 'complete'),
  naturalWidth: Object.getOwnPropertyDescriptor(prototype, 'naturalWidth'),
}

/** Every image reads as settled, broken or not, as it would after loading before hydration. */
function settleImages(width: number): void {
  Object.defineProperty(prototype, 'complete', { configurable: true, get: () => true })
  Object.defineProperty(prototype, 'naturalWidth', { configurable: true, get: () => width })
}

afterEach(() => {
  for (const [key, descriptor] of Object.entries(original)) {
    if (descriptor)
      Object.defineProperty(prototype, key, descriptor)
    else
      delete (prototype as unknown as Record<string, unknown>)[key]
  }
})

describe('skill card avatar', () => {
  it('reports an avatar that failed before the card hydrated', async () => {
    settleImages(0)
    const wrapper = await mountSuspended(SkillCard, { props: { skill, layout: 'row' } })
    expect(wrapper.emitted('avatarError')).toEqual([['gone-owner']])
    wrapper.unmount()
  })

  it('stays quiet for an avatar that loaded', async () => {
    settleImages(36)
    const wrapper = await mountSuspended(SkillCard, { props: { skill, layout: 'row' } })
    expect(wrapper.emitted('avatarError')).toBeUndefined()
    wrapper.unmount()
  })
})
