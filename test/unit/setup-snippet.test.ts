import { mountSuspended } from '@nuxt/test-utils/runtime'
import { expect, it } from 'vitest'
import SetupSnippet from '../../layers/marketing/app/components/_SetupSnippet.vue'

it('shows each command on its own line', async () => {
  const commands = ['npx skilld auth login', 'npx skilld changes']
  const wrapper = await mountSuspended(SetupSnippet, {
    props: { code: commands.join('\n'), label: 'account commands', format: 'skilld' },
  })
  expect(wrapper.findAll('code').map(line => line.text())).toEqual(commands)
  wrapper.unmount()
})
