import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import BadgeReadmeSnippet from '../../app/components/BadgeReadmeSnippet.vue'
import { skillBadgeEmbed } from '../../shared/skill-badge'

const copy = vi.hoisted(() => vi.fn())

mockNuxtImport('useClipboard', () => () => ({ copy, copied: ref(false) }))

const input = {
  owner: 'antfu',
  repo: 'skills',
  name: 'vite',
  registryPath: '/gh/antfu/skills/vite',
}

describe('readme snippet', () => {
  beforeEach(() => {
    copy.mockClear()
  })

  it('copies the badge that follows the light and dark GitHub themes', async () => {
    const wrapper = await mountSuspended(BadgeReadmeSnippet, { props: input })

    await wrapper.get('button[aria-label="Copy README snippet"]').trigger('click')

    expect(copy).toHaveBeenCalledWith(skillBadgeEmbed(input))
    wrapper.unmount()
  })
})
