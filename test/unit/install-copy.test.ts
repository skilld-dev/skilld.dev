import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { useInstallCopy } from '../../app/composables/useInstallCopy'

const installEvents: Record<string, unknown>[] = []

registerEndpoint('/api/events/install', {
  method: 'POST',
  handler: async (event) => {
    installEvents.push(await readBody(event))
    return { ok: true }
  },
})

describe('install copy', () => {
  beforeEach(() => {
    installEvents.length = 0
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('records a run copy from a skill card as mode run', async () => {
    // vueuse falls back to execCommand when clipboard-write is not granted,
    // so capture whichever path runs.
    const copied: string[] = []
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({
      writeText: (text: string) => {
        copied.push(text)
        return Promise.resolve()
      },
    } as unknown as Clipboard)
    const execCommandDescriptor = Object.getOwnPropertyDescriptor(document, 'execCommand')
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => {
        const textarea = document.querySelector('textarea')
        if (textarea)
          copied.push(textarea.value)
        return true
      }),
    })

    const wrapper = await mountSuspended(
      await import('../../app/components/SkillCard.vue').then(module => module.default),
      {
        props: {
          skill: { owner: 'antfu', repo: 'skills', name: 'vite', slug: 'antfu/vite', stars: 12 },
          showLike: false,
        },
      },
    )

    const copyButton = wrapper.findAll('button')
      .find(button => button.attributes('aria-label')?.includes('Copy run command'))
    expect(copyButton, 'skill card copy button missing its run-command label').toBeTruthy()

    await copyButton!.trigger('click')
    await flushPromises()

    expect(copied).toContain('npx skilld run skilld:antfu/skills/vite')
    await vi.waitFor(() => {
      expect(installEvents).toContainEqual(expect.objectContaining({
        surface: 'skill-card',
        mode: 'run',
      }))
    })

    wrapper.unmount()
    if (execCommandDescriptor)
      Object.defineProperty(document, 'execCommand', execCommandDescriptor)
    else
      Reflect.deleteProperty(document, 'execCommand')
  })

  it('copies with the legacy fallback when the async Clipboard API is unavailable', async () => {
    let clipboardOwner: object | null = navigator
    while (clipboardOwner && !Object.hasOwn(clipboardOwner, 'clipboard'))
      clipboardOwner = Object.getPrototypeOf(clipboardOwner)

    if (!clipboardOwner)
      throw new Error('Expected the test browser to expose a clipboard property')

    const clipboardDescriptor = Object.getOwnPropertyDescriptor(clipboardOwner, 'clipboard')
    const execCommandDescriptor = Object.getOwnPropertyDescriptor(document, 'execCommand')
    const execCommand = vi.fn(() => true)

    Reflect.deleteProperty(clipboardOwner, 'clipboard')
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    })
    try {
      expect('clipboard' in navigator).toBe(false)

      const wrapper = await mountSuspended(defineComponent({
        setup() {
          const result = ref('idle')
          const { copy } = useInstallCopy(
            'npx skilld add gh:antfu/skills',
            'test',
            'install',
            { kind: 'skill', owner: 'antfu', name: 'skills' },
          )

          return () => h('button', {
            'data-result': result.value,
            'onClick': async () => {
              result.value = (await copy())._tag
            },
          }, 'Copy install command')
        },
      }))

      await wrapper.get('button').trigger('click')
      await flushPromises()

      expect(execCommand).toHaveBeenCalledWith('copy')
      expect(wrapper.get('button').attributes('data-result')).toBe('copied')
      // The mode separates a run copy from an install copy in the ledger.
      await vi.waitFor(() => {
        expect(installEvents).toContainEqual(expect.objectContaining({
          surface: 'test',
          mode: 'install',
        }))
      })
    }
    finally {
      if (clipboardDescriptor)
        Object.defineProperty(clipboardOwner, 'clipboard', clipboardDescriptor)

      if (execCommandDescriptor)
        Object.defineProperty(document, 'execCommand', execCommandDescriptor)
      else
        Reflect.deleteProperty(document, 'execCommand')
    }
  })
})
