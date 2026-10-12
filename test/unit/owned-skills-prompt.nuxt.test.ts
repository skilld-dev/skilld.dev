import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import OwnedSkillsPrompt from '../../layers/identity/app/components/OwnedSkillsPrompt.vue'

const mocks = vi.hoisted(() => ({ execute: vi.fn(), refresh: vi.fn() }))
const account = ref<{ repo_indexing: boolean } | null>({ repo_indexing: false })
const status = ref('success')
const error = ref<Error | null>(null)
mockNuxtImport('useNuxtRpcQuery', () => () => ({ data: account, status, error, refresh: mocks.refresh }))
mockNuxtImport('useNuxtRpc', () => () => ({ execute: mocks.execute }))
mockNuxtImport('useAuth', () => () => ({ loginUrl: () => '/login' }))
mockNuxtImport('setQueryData', () => (_key: string, value: { repo_indexing: boolean }) => {
  account.value = value
})
mockNuxtImport('useNuxtMutation', () => (options: { mutation: () => Promise<unknown> }) => ({
  pending: ref(false),
  mutateSafe: () => options.mutation().then(data => ({ _tag: 'ok', data }), error => ({ _tag: 'err', error })),
}))

beforeEach(() => {
  vi.clearAllMocks()
  account.value = { repo_indexing: false }
  status.value = 'success'
  error.value = null
})

it('keeps saved indexing off across mounts without offering a scan', async () => {
  for (let mount = 0; mount < 2; mount++) {
    const wrapper = await mountSuspended(OwnedSkillsPrompt, { props: { login: 'octocat' } })
    expect(wrapper.text()).toContain('Indexing is off.')
    expect(wrapper.findAll('button')).toHaveLength(0)
    wrapper.unmount()
  }
  expect(mocks.execute).not.toHaveBeenCalled()
})

it('shows loading without assuming indexing is on', async () => {
  account.value = null
  status.value = 'pending'
  const wrapper = await mountSuspended(OwnedSkillsPrompt, { props: { login: 'octocat' } })
  expect(wrapper.text()).toContain('Loading your repository settings.')
  expect(wrapper.findAll('button')).toHaveLength(0)
  wrapper.unmount()
})

it('retries failed settings loading before offering actions', async () => {
  account.value = null
  status.value = 'error'
  error.value = new Error('offline')
  mocks.refresh.mockImplementation(async () => {
    account.value = { repo_indexing: false }
    status.value = 'success'
    error.value = null
  })
  const wrapper = await mountSuspended(OwnedSkillsPrompt, { props: { login: 'octocat' } })
  expect(wrapper.text()).toContain('Could not load your repository settings.')
  await wrapper.get('button').trigger('click')
  await flushPromises()
  expect(mocks.refresh).toHaveBeenCalledTimes(1)
  expect(wrapper.text()).toContain('Indexing is off.')
  wrapper.unmount()
})

it('shows failed turn-off feedback and retries without claiming success', async () => {
  account.value = { repo_indexing: true }
  mocks.execute.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ok: true })
  const wrapper = await mountSuspended(OwnedSkillsPrompt, { props: { login: 'octocat' } })
  const turnOff = () => wrapper.findAll('button').find(button => button.text() === 'Turn this off')!
  await turnOff().trigger('click')
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('Indexing is still on.')
  expect(wrapper.text()).not.toContain('Indexing is off.')
  await turnOff().trigger('click')
  await flushPromises()
  expect(mocks.execute).toHaveBeenLastCalledWith(expect.objectContaining({ path: '/api/me/privacy' }), { repo_indexing: false })
  expect(wrapper.text()).toContain('Indexing is off.')
  expect(wrapper.findAll('button')).toHaveLength(0)
  wrapper.unmount()
  const reloaded = await mountSuspended(OwnedSkillsPrompt, { props: { login: 'octocat' } })
  expect(reloaded.text()).toContain('Indexing is off.')
  expect(reloaded.findAll('button')).toHaveLength(0)
  reloaded.unmount()
})
