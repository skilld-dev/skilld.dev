import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { describe, expect, it, vi } from 'vitest'

const saved: unknown[] = []
const MOVED = 'Each package with a Skill is private or has no name. Skillgen updates published npm packages only.'

registerEndpoint('/api/me/skillgen', {
  method: 'GET',
  handler: () => ({
    items: [
      { owner: 'harlan-zw', repo: 'nuxt-link-checker', optedIn: false, eligibility: { _tag: 'Eligible', packages: ['nuxt-link-checker'] } },
      { owner: 'harlan-zw', repo: 'ripast', optedIn: false, eligibility: { _tag: 'Eligible', packages: ['@ripast/cli'] } },
      { owner: 'harlan-zw', repo: 'docs', optedIn: false, eligibility: { _tag: 'Ineligible', message: 'Skillgen supports npm packages only. Add a package.json at the root or under packages/.' } },
      { owner: 'harlan-zw', repo: 'nuxt-skew-protection', optedIn: true, eligibility: { _tag: 'Eligible', packages: ['nuxt-skew-protection'] } },
    ],
  }),
})

registerEndpoint('/api/me/skillgen', {
  method: 'PUT',
  handler: async (event) => {
    const body = await readBody<{ owner: string, repo: string, optedIn: boolean }>(event)
    saved.push(body)
    // The repository changed after the list loaded.
    if (body.repo === 'ripast')
      return { _tag: 'Refused', message: MOVED }
    return { _tag: 'Saved', ...body }
  },
})

describe('skillgen repository switches', () => {
  it('shows blocked repositories with their reason and turns on every ready one', async () => {
    const wrapper = await mountSuspended(
      await import('../../layers/identity/app/components/_SkillgenRepositories.vue').then(module => module.default),
    )
    await vi.waitFor(() => expect(wrapper.findAll('button[role="switch"]')).toHaveLength(3))

    // The blocked repository has no switch, and its reason shows before any click.
    expect(wrapper.text()).toContain('Add a package.json at the root or under packages/.')
    expect(wrapper.text()).toContain('1 of 3 on')
    expect(wrapper.text()).toContain('@ripast/cli')

    await wrapper.findAll('button').find(button => button.text() === 'Turn on all (2)')!.trigger('click')
    await vi.waitFor(() => expect(saved).toHaveLength(2))
    await flushPromises()

    expect(saved).toEqual([
      { owner: 'harlan-zw', repo: 'nuxt-link-checker', optedIn: true },
      { owner: 'harlan-zw', repo: 'ripast', optedIn: true },
    ])
    // The refused repository moves to the blocked group with the new reason.
    await vi.waitFor(() => expect(wrapper.findAll('button[role="switch"]')).toHaveLength(2))
    expect(wrapper.findAll('button[role="switch"]').map(control => control.attributes('aria-checked'))).toEqual(['true', 'true'])
    expect(wrapper.text()).toContain(MOVED)
    expect(wrapper.text()).toContain('2 of 2 on')
  })
})
