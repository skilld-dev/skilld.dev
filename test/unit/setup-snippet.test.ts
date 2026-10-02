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

it('highlights shell snippets without changing their text', async () => {
  const code = 'SKILLD_TOKEN="example-token"'
  const wrapper = await mountSuspended(SetupSnippet, {
    props: { code, label: '.env example', format: 'bash' },
  })
  expect(wrapper.find('code').text()).toBe(code)
  expect(wrapper.find('code .shj-str').exists()).toBe(true)
  wrapper.unmount()
})
