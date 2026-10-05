import { useToast } from '@nuxt/ui/composables/useToast'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { useActionFailure } from '../../layers/identity/app/composables/useActionFailure'

describe('action failure toast recovery', () => {
  let toast: ReturnType<typeof useToast>
  let first: ReturnType<typeof useActionFailure>
  let second: ReturnType<typeof useActionFailure>

  beforeEach(async () => {
    await mountSuspended(defineComponent({
      setup() {
        toast = useToast()
        toast.clear()
        first = useActionFailure()
        second = useActionFailure()
        return () => h('div')
      },
    }))
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  async function settleRemoval() {
    await flushPromises()
    await vi.advanceTimersByTimeAsync(250)
  }

  it('keeps a fast first failure after clearing an absent prior error', async () => {
    first.clear('save your like', 'first-fast-like')
    first('save your like', 'first-fast-like')(new Error('offline'))
    await settleRemoval()
    expect(toast.toasts.value.filter(item => item.open).map(item => item.title)).toEqual(['Could not save your like'])
  })

  it('keeps the latest rapid retry failure across composable instances', async () => {
    first('save your like', 'retry-like')(new Error('offline'))
    await flushPromises()
    second.clear('save your like', 'retry-like')
    second('save your like', 'retry-like')(new Error('still offline'))
    await flushPromises()
    first.clear('save your like', 'retry-like')
    first('save your like', 'retry-like')(new Error('offline again'))
    await settleRemoval()
    expect(toast.toasts.value.filter(item => item.open).map(item => item.title)).toEqual(['Could not save your like'])
  })

  it('clears successful recovery without dismissing another action or Skill', async () => {
    first('save your like', 'recovered-like')(new Error('offline'))
    first('save your like', 'other-like')(new Error('offline'))
    first('save your email settings')(new Error('offline'))
    await flushPromises()
    const [recoveredId, otherSkillId, emailId] = toast.toasts.value.map(item => item.id)
    second.clear('save your like', 'recovered-like')
    await settleRemoval()
    expect(toast.toasts.value.map(item => item.id)).toEqual([otherSkillId, emailId])
    expect(toast.toasts.value.map(item => item.id)).not.toContain(recoveredId)
    expect(toast.toasts.value.filter(item => item.open).map(item => item.title)).toEqual([
      'Could not save your like',
      'Could not save your email settings',
    ])
  })
})
