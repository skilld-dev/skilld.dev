import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import DirectoryCta from '../../layers/marketing/app/components/skills/_DirectoryCta.vue'

const auth = vi.hoisted(() => ({ signedIn: false, onboarded: false }))
mockNuxtImport('useAuth', () => () => ({
  state: ref(auth.signedIn
    ? { _tag: 'signed-in', user: { onboarded: auth.onboarded } }
    : { _tag: 'signed-out' }),
}))

beforeEach(() => {
  auth.signedIn = false
  auth.onboarded = false
})

it('cycles through sign-in, weekly preview, and MCP setup', async () => {
  const wrapper = await mountSuspended(DirectoryCta)
  expect(wrapper.get('a').attributes('href')).toBe('/login')
  await wrapper.get('[aria-label="Next suggestion"]').trigger('click')
  expect(wrapper.get('h2').text()).toBe('Trending skills this week')
  expect(wrapper.findAll('a').map(link => link.attributes('href'))).toContain('/weekly/preview')
  await wrapper.get('[aria-label="Next suggestion"]').trigger('click')
  expect(wrapper.get('a').attributes('href')).toBe('/developers?setup=mcp')
  expect(wrapper.find('[aria-label="Resume suggestions"]').exists()).toBe(true)
  wrapper.unmount()
})

it('offers MCP setup without sign-up prompts to a weekly subscriber', async () => {
  auth.signedIn = true
  auth.onboarded = true
  const wrapper = await mountSuspended(DirectoryCta)
  expect(wrapper.get('h2').text()).toBe('Add the MCP server')
  expect(wrapper.get('a').attributes('href')).toBe('/developers?setup=mcp')
  expect(wrapper.find('[aria-label="Next suggestion"]').exists()).toBe(false)
  wrapper.unmount()
})
