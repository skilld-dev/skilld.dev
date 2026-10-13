import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError } from 'h3'
import { ref } from 'vue'
import RepoPage from '../../layers/registry/app/pages/gh/[owner]/[repo]/index.vue'

mockNuxtImport('useRoute', () => () => ({ params: { owner: 'missing-owner', repo: 'missing-repo' }, query: {}, path: '/gh/missing-owner/missing-repo' }))
mockNuxtImport('useBotDetection', () => () => ({ isBot: ref(false) }))

registerEndpoint('/api/repos/missing-owner/missing-repo/route-target', () => ({ owner: 'missing-owner', repo: 'missing-repo', target: { _tag: 'repo' } }))
let missing = true
registerEndpoint('/api/repos/missing-owner/missing-repo', () => {
  if (missing)
    throw createError({ statusCode: 404, message: 'Repository not found' })
  return { owner: 'missing-owner', repo: 'missing-repo', description: 'Public Repository body', githubUrl: 'https://github.com/missing-owner/missing-repo', defaultBranch: 'main', stars: 2, forks: 0, pushedAt: '2026-01-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z', archived: false, fork: false, skillFileScanStatus: 'ok', skillFileCount: 0, skillFiles: [] }
})
registerEndpoint('/api/orgs/missing-owner', () => ({ owner: 'missing-owner', skills: [], repos: [], totalSkills: 0, totalStars: 0 }))

it('rejects a confirmed missing repository for a public non-bot visitor', async () => {
  await mountSuspended(RepoPage)
  expect(useError().value).toMatchObject({ statusCode: 404 })
})

it('renders a valid public Repository without a bot identity', async () => {
  clearNuxtData()
  await clearError()
  missing = false
  const wrapper = await mountSuspended(RepoPage)
  expect(useError().value).toBeUndefined()
  expect(wrapper.text()).toContain('Public Repository body')
  wrapper.unmount()
})
