import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import BadgeEmbedControl from '../../app/components/BadgeEmbedControl.vue'
import { skillBadgeEmbed } from '../../shared/skill-badge'

const copy = vi.hoisted(() => vi.fn())

mockNuxtImport('useClipboard', () => () => ({ copy, copied: ref(false) }))

const ModalStub = defineComponent({
  props: {
    open: Boolean,
    title: String,
  },
  template: '<div v-if="open" role="dialog" :aria-label="title"><slot name="body" /><slot name="footer" /></div>',
})

const input = {
  owner: 'antfu',
  repo: 'skills',
  name: 'vite',
  registryPath: '/gh/antfu/skills/vite',
}

async function mountControl(extra: { trendingAward?: { board: 'week' | 'month', period: string, rank: number } } = {}) {
  return await mountSuspended(BadgeEmbedControl, {
    props: { ...input, ...extra },
    global: {
      stubs: {
        UModal: ModalStub,
      },
    },
  })
}

function buttonWithText(wrapper: Awaited<ReturnType<typeof mountControl>>, text: string) {
  const button = wrapper.findAll('button').find(candidate => candidate.text().includes(text))
  if (!button)
    throw new Error(`Button not found: ${text}`)
  return button
}

describe('readme badge editor', () => {
  beforeEach(() => {
    copy.mockClear()
  })

  it('shows the minimal badge before opening the editor', async () => {
    const wrapper = await mountControl()

    expect(wrapper.get('[data-testid="minimal-badge-light"]').attributes('src')).toBe('/b/antfu/skills/vite?theme=light&label=0')
    expect(wrapper.get('[data-testid="minimal-badge-dark"]').attributes('src')).toBe('/b/antfu/skills/vite?theme=dark&label=0')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)

    await wrapper.get('button[aria-label="Configure README badge"]').trigger('click')

    expect(wrapper.get('[role="dialog"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('copies the selected category and likes options with automatic GitHub themes', async () => {
    const wrapper = await mountControl()
    await wrapper.get('button[aria-label="Configure README badge"]').trigger('click')
    await buttonWithText(wrapper, 'Hide').trigger('click')
    await buttonWithText(wrapper, 'With likes').trigger('click')
    await wrapper.get('button[aria-label="Preview dark badge"]').trigger('click')

    expect(wrapper.get('[data-testid="badge-preview"]').attributes('src')).toBe('/b/antfu/skills/vite?likes=1&theme=dark&label=0')

    await buttonWithText(wrapper, 'Copy README badge').trigger('click')

    expect(copy).toHaveBeenCalledWith(skillBadgeEmbed({
      ...input,
      showLabel: false,
      showLikes: true,
    }))
    wrapper.unmount()
  })

  it('offers the award only when the Skill holds one, and starts with it on', async () => {
    const plain = await mountControl()
    await plain.get('button[aria-label="Configure README badge"]').trigger('click')
    expect(plain.findAll('button').some(button => button.text().includes('With award'))).toBe(false)
    plain.unmount()

    const wrapper = await mountControl({ trendingAward: { board: 'month', period: '2026-09', rank: 2 } })
    await wrapper.get('button[aria-label="Configure README badge"]').trigger('click')
    expect(wrapper.text()).toContain('Add #2 trending, September 2026.')
    expect(wrapper.get('[data-testid="badge-preview"]').attributes('src')).toBe('/b/antfu/skills/vite?trending=1&theme=light')

    const awardGroup = wrapper.get('[aria-label="Badge trending award"]')
    await awardGroup.findAll('button').find(button => button.text() === 'Plain')!.trigger('click')
    expect(wrapper.get('[data-testid="badge-preview"]').attributes('src')).toBe('/b/antfu/skills/vite?theme=light')
    wrapper.unmount()
  })
})
