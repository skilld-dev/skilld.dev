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
  contentHtml: '<h2>Saved Skill content</h2><p>body</p>',
  raw: null,
  frontmatter: null,
  assets: [],
  assetCount: 0,
  curators: [],
  tags: [],
  keywords: ['component-testing'],
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
    skillFileUrl: 'https://github.com/mirror/multi/blob/main/skills/shared-skill/SKILL.md',
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

let sourceGone = false
let savedCopy = true

function skillPayload() {
  return {
    ...payload,
    sourceGone,
    raw: savedCopy ? '# Saved copy' : null,
    contentHtml: savedCopy ? payload.contentHtml : null,
    assets: [{ path: 'references/guide.md', size: 100, type: 'markdown' }],
    assetCount: 1,
  }
}

beforeEach(() => {
  navigateToMock.mockClear()
  sourceGone = false
  savedCopy = true
})

describe('skillDetail duplicate-group canonical URL', () => {
  it('does not promise a saved copy when none exists', async () => {
    sourceGone = true
    savedCopy = false
    const wrapper = await mountSuspended(
      await import('../../layers/registry/app/components/SkillDetail.vue').then(module => module.default),
      { props: { owner: 'mirror', repo: 'multi', name: 'shared-skill' } },
    )
    const notice = wrapper.get('section[aria-labelledby="broken-heading"]')
    expect(notice.text()).toContain('This Skill may have been removed or moved.')
    expect(notice.text()).not.toContain('Below is the last saved copy.')
    wrapper.unmount()
  })

  it('explains an unavailable GitHub source before the saved content', async () => {
    sourceGone = true
    const wrapper = await mountSuspended(
      await import('../../layers/registry/app/components/SkillDetail.vue').then(module => module.default),
      { props: { owner: 'mirror', repo: 'multi', name: 'shared-skill' } },
    )

    const notice = wrapper.get('section[aria-labelledby="broken-heading"]')
    expect.soft(notice.text()).toContain('Source unavailable on GitHub')
    expect.soft(notice.text()).toContain('This Skill may have been removed or moved. Below is the last saved copy.')
    expect(notice.get('a[href="https://github.com/mirror/multi"]').text()).toBe('Browse repository')
    const savedContent = wrapper.findAll('h2').find(heading => heading.text() === 'Saved Skill content')!
    expect(notice.element.compareDocumentPosition(savedContent.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    wrapper.unmount()
  })

  it.each([false, true])('offers file links only when the source exists, gone: %s', async (gone) => {
    sourceGone = gone
    const wrapper = await mountSuspended(
      await import('../../layers/registry/app/components/SkillDetail.vue').then(module => module.default),
      { props: { owner: 'mirror', repo: 'multi', name: 'shared-skill' } },
    )

    expect(wrapper.find('a[href="/api/skills-raw/mirror/multi/shared-skill"]').exists()).toBe(!gone)
    expect(wrapper.find('a[href$="/-/references/guide.md"]').exists()).toBe(!gone)
    expect.soft(wrapper.find('a[href="https://github.com/mirror/multi/blob/main/skills/shared-skill/SKILL.md"]').exists()).toBe(!gone)
    expect(wrapper.find('button[aria-label="Copy install command"]').exists()).toBe(!gone)
    const claude = wrapper.findAll('button').find(button => button.text() === 'Claude')
    expect(Boolean(claude)).toBe(!gone)
    if (claude)
      await claude.trigger('click')
    expect(wrapper.findAll('button').some(button => button.text() === 'Download shared-skill.zip')).toBe(!gone)
    expect(wrapper.text()).toContain('copy')
    wrapper.unmount()
  })

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

  it('shows free-form keywords without linking to an unavailable tag page', async () => {
    const wrapper = await mountSuspended(
      await import('../../layers/registry/app/components/SkillDetail.vue').then(module => module.default),
      {
        props: { owner: 'mirror', repo: 'multi', name: 'shared-skill' },
      },
    )

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('component-testing')
      expect(wrapper.find('a[href="/skills/tag/component-testing"]').exists()).toBe(false)
    })

    wrapper.unmount()
  })
})
