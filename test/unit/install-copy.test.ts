import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { useInstallCopy } from '../../app/composables/useInstallCopy'

describe('install copy', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
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
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue(undefined))

    try {
      expect('clipboard' in navigator).toBe(false)

      const wrapper = await mountSuspended(defineComponent({
        setup() {
          const result = ref('idle')
          const { copy } = useInstallCopy(
            'npx skilld add gh:antfu/skills',
            'test',
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
