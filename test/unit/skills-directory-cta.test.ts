import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import DirectoryCta from '../../layers/marketing/app/components/skills/_DirectoryCta.vue'

const visit = vi.hoisted(() => ({ signedIn: false, onboarded: false }))
mockNuxtImport('useAuth', () => () => ({
  state: ref(visit.signedIn
    ? { _tag: 'signed-in', user: { onboarded: visit.onboarded } }
    : { _tag: 'signed-out' }),
}))

beforeEach(() => {
  visit.signedIn = false
  visit.onboarded = false
  useState('skills-directory-promotion', () => 0).value = 0
})

it.each([
  [0, 'Watch for changes', '/login'],
  [0.5, 'Trending skills this week', '/login'],
  [0.9, 'Add the MCP server', '/developers?setup=mcp'],
])('offers a relevant action for visit %s', async (selection, title, href) => {
  useState('skills-directory-promotion', () => 0).value = selection
  const wrapper = await mountSuspended(DirectoryCta)
  expect(wrapper.get('h2').text()).toBe(title)
  expect(wrapper.get('a').attributes('href')).toBe(href)
  if (title === 'Trending skills this week')
    expect(wrapper.findAll('a').map(link => link.attributes('href'))).toContain('/weekly/preview')
  wrapper.unmount()
})

it('offers MCP setup without sign-up prompts to a weekly subscriber', async () => {
  visit.signedIn = true
  visit.onboarded = true
  const wrapper = await mountSuspended(DirectoryCta)
  expect(wrapper.get('h2').text()).toBe('Add the MCP server')
  expect(wrapper.get('a').attributes('href')).toBe('/developers?setup=mcp')
  wrapper.unmount()
})
