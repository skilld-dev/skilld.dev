import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import SkillPnpmPackage from '../../layers/registry/app/components/_SkillPnpmPackage.vue'

describe('pnpm package install option', () => {
  it('stays hidden when no published package includes the Skill', async () => {
    const wrapper = await mountSuspended(SkillPnpmPackage, { props: { published: null } })
    expect(wrapper.find('details').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the published version and package-wide approval limit', async () => {
    const wrapper = await mountSuspended(SkillPnpmPackage, { props: { published: { _tag: 'Found', package: '@acme/kit', version: '1.2.3', skill: 'auth' } } })
    expect(wrapper.find('summary').text()).toBe('Use with pnpm')
    expect(wrapper.text()).toContain('pnpm add @acme/kit@1.2.3')
    expect(wrapper.text()).toContain('pnpm approve')
    expect(wrapper.text()).toContain('Approval covers every Skill and later version of the package.')
    expect(wrapper.find('a').attributes('href')).toBe('https://www.npmjs.com/package/@acme/kit/v/1.2.3')
    wrapper.unmount()
  })
})
