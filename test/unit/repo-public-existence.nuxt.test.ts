import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError } from 'h3'
import { ref } from 'vue'
import RepoPage from '../../layers/registry/app/pages/gh/[owner]/[repo]/index.vue'

mockNuxtImport('useRoute', () => () => ({ params: { owner: 'missing-owner', repo: 'missing-repo' }, query: {}, path: '/gh/missing-owner/missing-repo' }))
mockNuxtImport('useBotDetection', () => () => ({ isBot: ref(false) }))

registerEndpoint('/api/repos/missing-owner/missing-repo/route-target', () => ({ owner: 'missing-owner', repo: 'missing-repo', target: { _tag: 'repo' } }))
registerEndpoint('/api/repos/missing-owner/missing-repo', () => { throw createError({ statusCode: 404, message: 'Repository not found' }) })
registerEndpoint('/api/orgs/missing-owner', () => ({ owner: 'missing-owner', skills: [], repos: [], totalSkills: 0, totalStars: 0 }))

it('rejects a confirmed missing repository for a public non-bot visitor', async () => {
  await mountSuspended(RepoPage)
  expect(useError().value).toMatchObject({ statusCode: 404 })
})
