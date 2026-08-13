import type { StandaloneWideEvent } from '@harlan-zw/nuxt-wide-events/standalone'
import { vi } from 'vitest'
import { emitOperationalEvent } from '../server/utils/operational-event'

vi.stubGlobal('createWideEvent', (): StandaloneWideEvent => ({
  context: {},
  setLevel: vi.fn(),
  emit: vi.fn(() => null),
}))
vi.stubGlobal('emitOperationalEvent', emitOperationalEvent)
