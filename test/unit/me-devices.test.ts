import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { nextTick, ref } from 'vue'

const devices = ref<{ items: DeviceFixture[] } | undefined>()
const loadError = ref<Error | undefined>()
const loadStatus = ref<'idle' | 'pending' | 'success' | 'error'>('success')
const refresh = vi.fn().mockResolvedValue(undefined)
const requestFetch = vi.hoisted(() => vi.fn())

interface DeviceFixture {
  id: number
  kind: string
  device_label: string | null
  cli_version: string | null
  scopes: string
  created_at: number
  last_used_at: number
  expires_at: number | null
  revoked_at: number | null
}

mockNuxtImport('$fetch', () => requestFetch)

mockNuxtImport('useFetch', () => {
  return () => ({
    data: devices,
    error: loadError,
    status: loadStatus,
    refresh,
  })
})

async function mountPage() {
  return await mountSuspended(
    await import('../../app/pages/me/devices.vue').then(module => module.default),
  )
}

function deviceFixture(): DeviceFixture {
  return {
    id: 42,
    kind: 'cli',
    device_label: 'Work laptop',
    cli_version: '1.2.3',
    scopes: 'read write',
    created_at: 1_786_000_000,
    last_used_at: 1_786_000_100,
    expires_at: null,
    revoked_at: null,
  }
}

describe('devices page behavior', () => {
  beforeEach(() => {
    devices.value = { items: [deviceFixture()] }
    loadError.value = undefined
    loadStatus.value = 'success'
    refresh.mockReset()
    refresh.mockImplementation(async () => {
      devices.value = {
        items: (devices.value?.items ?? []).map(device => ({
          ...device,
          revoked_at: device.id === 42 ? 1_786_000_200 : device.revoked_at,
        })),
      }
    })
    requestFetch.mockReset()
    requestFetch.mockResolvedValue({ ok: true })
  })

  it('shows a failed load and offers a retry', async () => {
    devices.value = undefined
    loadError.value = new Error('offline')
    loadStatus.value = 'error'

    const wrapper = await mountPage()

    expect(wrapper.get('[role="alert"]').text()).toContain('Could not load CLI devices')
    await wrapper.get('button').trigger('click')
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('revokes a device through the API and refreshes the list', async () => {
    const wrapper = await mountPage()

    await wrapper.get('button[aria-label="Revoke Work laptop"]').trigger('click')
    await flushPromises()

    expect(requestFetch).toHaveBeenCalledWith('/api/me/devices/42/revoke', { method: 'POST' })
    expect(refresh).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('revoked')
    expect(wrapper.find('button[aria-label="Revoke Work laptop"]').exists()).toBe(false)
  })

  it('disables revoke while its request is pending', async () => {
    let resolveRevoke: ((value: { ok: true }) => void) | undefined
    requestFetch.mockImplementation(() => new Promise<{ ok: true }>((resolve) => {
      resolveRevoke = resolve
    }))
    const wrapper = await mountPage()
    const revoke = wrapper.get('button[aria-label="Revoke Work laptop"]')

    await revoke.trigger('click')
    await nextTick()

    expect(revoke.attributes('disabled')).toBeDefined()
    resolveRevoke?.({ ok: true })
    await flushPromises()
  })

  it('keeps a failed revoke visible beside the device', async () => {
    requestFetch.mockRejectedValue(new Error('network unavailable'))
    const wrapper = await mountPage()

    await wrapper.get('button[aria-label="Revoke Work laptop"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('Could not revoke this session')
  })

  it('shows progress while the initial request is pending', async () => {
    devices.value = undefined
    loadStatus.value = 'pending'

    const wrapper = await mountPage()

    expect(wrapper.get('[role="status"]').text()).toContain('Loading CLI devices')
  })
})
