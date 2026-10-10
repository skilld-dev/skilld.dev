import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import SkillCommandPanel from '../../layers/registry/app/components/_SkillCommandPanel.vue'
import SkillPnpmPackage from '../../layers/registry/app/components/_SkillPnpmPackage.vue'

const published = { _tag: 'Found', package: '@acme/kit', version: '1.2.3', skill: 'auth' } as const
const commands = {
  runUrl: 'https://skilld.dev/gh/acme/kit/auth',
  installCommand: 'npx skilld install acme/kit/auth',
  runCopied: false,
  installCopied: false,
  copyError: '',
  modelValue: 'run' as const,
}

describe('npm package install option', () => {
  it('offers npm only when a published package includes the Skill', async () => {
    const wrapper = await mountSuspended(SkillCommandPanel, { props: { ...commands, layout: 'stacked' } })
    expect(wrapper.findAll('button').some(button => button.text() === 'NPM')).toBe(false)
    await wrapper.setProps({ published })
    expect(wrapper.text()).toContain('pnpm add @acme/kit@1.2.3')
    expect(wrapper.text()).not.toContain('npx skilld install acme/kit/auth')
    expect(wrapper.text()).not.toContain('Run once off')
    expect(wrapper.findAll('a').some(link => link.text() === 'Fork this Skill')).toBe(false)
    await wrapper.setProps({ published: null })
    expect(wrapper.text()).toContain('Run once off')
    expect(wrapper.text()).toContain('npx skilld install acme/kit/auth')
    wrapper.unmount()
  })

  it('defaults to npm with Run second, then switches to Run and Install', async () => {
    const wrapper = await mountSuspended(SkillCommandPanel, { props: { ...commands, published } })
    expect(wrapper.find('[data-testid="pnpm-package"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Command type"]').findAll('button').map(button => button.text())).toEqual(['NPM', 'Run', 'Install'])
    await wrapper.findAll('button').find(button => button.text() === 'Run')!.trigger('click')
    expect(wrapper.find('[data-testid="pnpm-package"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Nothing lands on disk.')
    await wrapper.findAll('button').find(button => button.text() === 'Install')!.trigger('click')
    await wrapper.setProps({ modelValue: 'install' })

    expect(wrapper.text()).toContain('npx skilld install acme/kit/auth')
    expect(wrapper.find('[data-testid="pnpm-package"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows package approval and switches to skills-npm setup', async () => {
    const wrapper = await mountSuspended(SkillPnpmPackage, { props: { published } })
    expect(wrapper.find('code').text()).toBe('pnpm add @acme/kit@1.2.3')
    expect(wrapper.find('code span[style]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Approval covers every Skill and later version of the package.')
    expect(wrapper.find('a').attributes('href')).toBe('https://www.npmjs.com/package/@acme/kit/v/1.2.3')
    await wrapper.findAll('button').find(button => button.text() === 'skills-npm')!.trigger('click')
    expect(wrapper.text()).toContain('npm install @acme/kit@1.2.3')
    expect(wrapper.text()).toContain('npx skills-npm setup')
    expect(wrapper.text()).toContain('Setup changes your prepare script')
    expect(wrapper.text()).not.toContain('pnpm approve')
    wrapper.unmount()
  })
})
