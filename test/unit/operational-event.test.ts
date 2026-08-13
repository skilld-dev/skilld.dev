import type { StandaloneWideEvent } from '@harlan-zw/nuxt-wide-events/standalone'
import { describe, expect, it, vi } from 'vitest'
import { emitOperationalEvent } from '../../server/utils/operational-event'

describe('emitOperationalEvent', () => {
  it('sets the requested level before emitting once', () => {
    const calls: string[] = []
    const event: StandaloneWideEvent = {
      context: {},
      setLevel: vi.fn((level: string) => calls.push(level)),
      emit: vi.fn(() => {
        calls.push('emit')
        return null
      }),
    }

    emitOperationalEvent(event, 'error')

    expect(calls).toEqual(['error', 'emit'])
  })

  it('preserves warning severity by default', () => {
    const event: StandaloneWideEvent = {
      context: {},
      setLevel: vi.fn(),
      emit: vi.fn(() => null),
    }

    emitOperationalEvent(event)

    expect(event.setLevel).toHaveBeenCalledWith('warn')
    expect(event.emit).toHaveBeenCalledOnce()
  })
})
