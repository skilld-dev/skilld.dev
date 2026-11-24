import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { computed, ref } from 'vue'
import LikeButton from '../../layers/identity/app/components/LikeButton.vue'
import SkillsDirectory from '../../layers/marketing/app/pages/skills/index.vue'

vi.stubGlobal('defineOgImage', () => {})

const signedIn = ref(true)
mockNuxtImport('useAuth', () => () => ({
  isAuthenticated: signedIn,
  state: computed(() => signedIn.value
    ? { _tag: 'signed-in', user: { onboarded: true } }
    : { _tag: 'anonymous' }),
}))

const skill = { owner: 'mattpocock', repo: 'skills', name: 'tdd' }
const route = '/skills?q=tdd&sort=likes'
let savedCount = 0

registerEndpoint('/api/skills', () => ({
  items: [{ ...skill, slug: 'mattpocock/tdd', registryPath: '/gh/mattpocock/skills/tdd', likeCount: 0 }],
  total: 1,
  pages: 1,
}))
registerEndpoint('/api/skills/tags', () => ({ tags: [], total: 0 }))
registerEndpoint('/api/skills/featured', () => ({ devSections: [] }))
registerEndpoint('/api/feed/trending', () => ({ namedSkills: [] }))
registerEndpoint('/api/me/likes', () => ({ items: savedCount ? [{ ...skill, likeCount: savedCount }] : [] }))
registerEndpoint('/api/me/likes', { method: 'POST', handler: () => ({ ok: true, likeCount: ++savedCount }) })
registerEndpoint('/api/me/likes/mattpocock/skills/tdd', { method: 'DELETE', handler: () => ({ ok: true, likeCount: --savedCount }) })

beforeEach(() => {
  signedIn.value = true
  savedCount = 0
  clearNuxtState(key => key.startsWith('skill-like'))
  clearNuxtData('skills-registry-table')
})

it('shows the saved count when the public directory still reports zero', async () => {
  signedIn.value = false
  savedCount = 1
  const directory = await mountSuspended(SkillsDirectory, { route })
  try {
    await vi.waitFor(() => expect(directory.find('[title="0 likes"]').exists()).toBe(true))

    signedIn.value = true
    await vi.waitFor(() => expect(directory.find('[title="1 like"]').exists()).toBe(true))
  }
  finally {
    directory.unmount()
  }
})

it('reflects a like and unlike while the directory response stays cached', async () => {
  const button = await mountSuspended(LikeButton, { props: skill })
  const directory = await mountSuspended(SkillsDirectory, { route })
  try {
    await vi.waitFor(() => expect(directory.find('[title="0 likes"]').exists()).toBe(true))

    await button.get('button').trigger('click')
    await flushPromises()
    expect(directory.find('[title="1 like"]').exists()).toBe(true)

    await button.get('button').trigger('click')
    await flushPromises()
    expect(directory.find('[title="0 likes"]').exists()).toBe(true)
  }
  finally {
    button.unmount()
    directory.unmount()
  }
})
