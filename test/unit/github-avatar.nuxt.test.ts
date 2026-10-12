import { mountSuspended } from '@nuxt/test-utils/runtime'
import GitHubAvatar from '../../app/components/GitHubAvatar.vue'

beforeEach(() => {
  vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(false)
})

afterEach(() => vi.restoreAllMocks())

it('replaces a failed avatar with owner initials and reports the failure', async () => {
  const wrapper = await mountSuspended(GitHubAvatar, { props: { owner: 'cloudflare' } })
  await wrapper.get('img').trigger('error')
  expect(wrapper.find('img').exists()).toBe(false)
  expect(wrapper.text()).toBe('CL')
  expect(wrapper.emitted('avatarError')).toHaveLength(1)
  wrapper.unmount()
})

it('loads the new owner after a previous avatar failed', async () => {
  const wrapper = await mountSuspended(GitHubAvatar, { props: { owner: 'cloudflare' } })
  await wrapper.get('img').trigger('error')
  await wrapper.setProps({ owner: 'vuejs' })
  expect(wrapper.find('img').exists()).toBe(true)
  expect(wrapper.get('img').attributes('src')).toContain('vuejs.png')
  wrapper.unmount()
})
