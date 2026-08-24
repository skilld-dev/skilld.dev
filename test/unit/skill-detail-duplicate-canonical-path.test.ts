import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'

const route = reactive({
  path: '/gh/mirror/multi/shared-skill',
  query: {},
  params: { owner: 'mirror', repo: 'multi', name: 'shared-skill' },
})
const navigateToMock = vi.hoisted(() => vi.fn())

mockNuxtImport('useRoute', () => () => route)
mockNuxtImport('navigateTo', () => navigateToMock)
vi.stubGlobal('defineOgImage', () => {})
mockNuxtImport('useSchemaOrg', () => () => {})
mockNuxtImport('useFetch', () => (url: unknown) => {
  const key = typeof url === 'function' ? url() : url

  if (typeof key === 'string' && key.startsWith('/api/skills/'))
    return { data: ref(skillPayload()), status: ref('success'), error: ref(null), refresh: vi.fn() }
  if (key === `/api/skill-related/${route.params.owner}/${route.params.repo}/${route.params.name}`) {
    return {
      data: ref({ commits: [], relatedRepoSkills: [], relatedOwnerSkills: [], coOccurrenceSkills: [], semanticSiblings: [] }),
      status: ref('success'),
      error: ref(null),
      refresh: vi.fn(),
    }
  }
  return { data: ref(null), status: ref('success'), error: ref(null), refresh: vi.fn() }
})

// The mounted page is itself in a multi-Skill repo, so only the duplicate-group
// canonical link can exercise single-Skill hub routing.
const payload = {
  owner: 'mirror',
  repo: 'multi',
  name: 'shared-skill',
  registryPath: '/gh/mirror/multi/shared-skill',
  displayName: 'Shared Skill',
  githubUrl: 'https://github.com/mirror/multi',
  description: 'A duplicated skill.',
  license: null,
  stars: 12,
  forks: 1,
  pushedAt: '2026-08-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  maturity: null,
  branch: 'main',
  skillPath: 'skills/shared-skill/SKILL.md',
  resolutionStatus: 'ok',
  sourceGone: false,
  tier: 'community',
  contentHtml: '<p>body</p>',
  raw: null,
  frontmatter: null,
  assets: [],
  assetCount: 0,
  curators: [],
  tags: [],
  keywords: [],
  likeCount: 0,
  faqs: [],
  summary: null,
  sourceFacts: {
    description: { present: true, length: 17, source: 'frontmatter' },
    repository: {
      pushedAt: '2026-08-01T00:00:00.000Z',
      pushedAgeDays: 23,
      createdAt: '2026-01-01T00:00:00.000Z',
      stars: 12,
      forks: 1,
      defaultBranch: 'main',
    },
    source: {
      resolved: true,
      gone: false,
      resolutionStatus: 'ok',
      skillPath: 'skills/shared-skill/SKILL.md',
      currentSha: 'abc',
      hasCurrentSha: true,
      latestRevisionSha: 'abc',
      modifiedAt: null,
      modifiedAgeDays: null,
      referencesCount: 0,
      lastSyncedAt: null,
      lastSyncedAgeDays: null,
      syncStatus: 'ok',
    },
    frontmatter: {
      present: true,
      keys: ['description', 'name'],
      model: null,
      allowedTools: [],
      capabilityScopes: [],
      mcpServers: [],
    },
  },
  provenance: {
    owner: 'mirror',
    repo: 'multi',
    branch: 'main',
    skillPath: 'skills/shared-skill/SKILL.md',
    sourceCommitSha: 'abc',
    sourceCommitUrl: 'https://github.com/mirror/multi/commit/abc',
    skillFileUrl: null,
    historyUrl: null,
    modifiedAt: null,
    referencesCount: 0,
    lastSyncedAt: null,
    syncStatus: 'ok',
  },
  seo: {
    indexScore: 0,
    indexable: false,
    reasons: [],
    syncedAt: null,
    curatorCount: 0,
    curatorReasonCount: 0,
    approvedSocialCount: 0,
    authorSocialCount: 0,
  },
  trust: { tier: 'untrusted', source: 'computed', score: 0, reasons: [], syncedAt: null },
  duplicateGroup: {
    reason: 'duplicate_content',
    // The canonical twin lives in a repository with exactly one Skill.
    canonical: {
      name: 'shared-skill',
      owner: 'source',
      repo: 'single',
      displayName: 'Shared Skill',
      stars: 40,
      slug: 'source/single/shared-skill',
      supportTier: null,
      trustTier: 'official',
      registryPath: '/gh/source/single',
    },
    isCanonical: false,
    siblings: [],
  },
}

function skillPayload() {
  return payload
}

beforeEach(() => {
  navigateToMock.mockClear()
})

describe('skillDetail duplicate-group canonical URL', () => {
  it('points the weaker-duplicate canonical link at the twin repo hub when that repo has one Skill', async () => {
    const wrapper = await mountSuspended(
      await import('../../layers/registry/app/components/SkillDetail.vue').then(module => module.default),
      {
        props: { owner: 'mirror', repo: 'multi', name: 'shared-skill' },
      },
    )

    await vi.waitFor(() => {
      const hrefs = wrapper.findAll('a').map(anchor => anchor.attributes('href'))
      expect(hrefs).toContain('/gh/source/single')
    })

    wrapper.unmount()
  })
})
