import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { describe, expect, it, vi } from 'vitest'

const saved: unknown[] = []

registerEndpoint('/api/me/skillgen', {
  method: 'GET',
  handler: () => ({
    items: [
      { owner: 'harlan-zw', repo: 'nuxt-skew-protection', optedIn: false },
      { owner: 'harlan-zw', repo: 'monorepo', optedIn: false },
    ],
  }),
})

registerEndpoint('/api/me/skillgen', {
  method: 'PUT',
  handler: async (event) => {
    const body = await readBody<{ owner: string, repo: string, optedIn: boolean }>(event)
    saved.push(body)
    if (body.repo === 'monorepo')
      return { _tag: 'Refused', message: 'Skillgen supports npm packages only. Add a package.json with a name at the repository root.' }
    return { _tag: 'Saved', ...body }
  },
})

describe('skillgen repository switches', () => {
  it('turns one repository on and shows why another was refused', async () => {
    const wrapper = await mountSuspended(
      await import('../../layers/identity/app/components/_SkillgenRepositories.vue').then(module => module.default),
    )
    await flushPromises()

    const switches = wrapper.findAll('button[role="switch"]')
    expect(switches.map(control => control.attributes('aria-checked'))).toEqual(['false', 'false'])
    expect(wrapper.text()).toContain('harlan-zw/nuxt-skew-protection')

    await switches[0]!.trigger('click')
    await flushPromises()
    await switches[1]!.trigger('click')
    await flushPromises()

    expect(saved).toEqual([
      { owner: 'harlan-zw', repo: 'nuxt-skew-protection', optedIn: true },
      { owner: 'harlan-zw', repo: 'monorepo', optedIn: true },
    ])
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))
    const after = wrapper.findAll('button[role="switch"]')
    expect(after.map(control => control.attributes('aria-checked'))).toEqual(['true', 'false'])
    expect(wrapper.get('[role="alert"]').text()).toBe('Skillgen supports npm packages only. Add a package.json with a name at the repository root.')
  })
})
