import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { describe, expect, it, vi } from 'vitest'
import { reactive, ref, toValue } from 'vue'

const route = reactive({
  path: '/gh/antfu/skills/vite',
  query: {},
  params: { owner: 'antfu', repo: 'skills', name: 'vite' },
})

const schemaNodes = vi.hoisted(() => ({ current: null as unknown }))

const installEvents: Record<string, unknown>[] = []

registerEndpoint('/api/events/install', {
  method: 'POST',
  handler: async (event) => {
    installEvents.push(await readBody(event))
    return { ok: true }
  },
})

mockNuxtImport('useRoute', () => () => route)
mockNuxtImport('navigateTo', () => vi.fn())
vi.stubGlobal('defineOgImage', () => {})
mockNuxtImport('useSchemaOrg', () => (nodes: unknown) => {
  schemaNodes.current = nodes
})
mockNuxtImport('useFetch', () => (url: unknown) => {
  const key = typeof url === 'function' ? url() : url

  if (typeof key === 'string' && key.startsWith('/api/skills/'))
    return { data: ref(payload), status: ref('success'), error: ref(null), refresh: vi.fn() }
  return { data: ref(null), status: ref('success'), error: ref(null), refresh: vi.fn() }
})

const payload = {
  owner: 'antfu',
  repo: 'skills',
  name: 'vite',
  registryPath: '/gh/antfu/skills/vite',
  displayName: 'Vite',
  githubUrl: 'https://github.com/antfu/skills',
  description: 'Vite configuration conventions.',
  license: null,
  stars: 12,
  forks: 1,
  pushedAt: '2026-08-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  maturity: null,
  branch: 'main',
  skillPath: 'skills/vite/SKILL.md',
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
    description: { present: true, length: 30, source: 'frontmatter' },
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
      skillPath: 'skills/vite/SKILL.md',
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
    owner: 'antfu',
    repo: 'skills',
    branch: 'main',
    skillPath: 'skills/vite/SKILL.md',
    sourceCommitSha: 'abc',
    sourceCommitUrl: 'https://github.com/antfu/skills/commit/abc',
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
  duplicateGroup: null,
}

interface HowToNode {
  '@id': string
  'name': string
  'step': { name: string, text: string, url: string }[]
}

function howToNode(): HowToNode {
  const nodes = toValue(schemaNodes.current) as { '@id'?: string }[]
  const howTo = nodes.find(node => node['@id']?.endsWith('#run'))
  expect(howTo, 'HowTo node missing from the skill page structured data').toBeTruthy()
  return howTo as unknown as HowToNode
}

describe('skillDetail HowTo structured data', () => {
  it('publishes the run command the page leads with', async () => {
    const wrapper = await mountSuspended(
      await import('../../layers/registry/app/components/SkillDetail.vue').then(module => module.default),
      { props: { owner: 'antfu', repo: 'skills', name: 'vite' } },
    )

    await vi.waitFor(() => {
      expect(howToNode().step[0]!.text).toBe('Use this Skill: https://skilld.dev/gh/antfu/skills/vite')
    })

    wrapper.unmount()
  })

  it('points the HowTo fragment at a section the page renders', async () => {
    const wrapper = await mountSuspended(
      await import('../../layers/registry/app/components/SkillDetail.vue').then(module => module.default),
      { props: { owner: 'antfu', repo: 'skills', name: 'vite' } },
    )

    await vi.waitFor(() => {
      const node = howToNode()
      expect(node['@id']).toBe('https://skilld.dev/gh/antfu/skills/vite#run')
      expect(node.step[0]!.url).toBe('https://skilld.dev/gh/antfu/skills/vite#run')
      // `find` returns the first match, so it cannot see a duplicate id come back.
      expect(wrapper.findAll('#run')).toHaveLength(1)
    })

    wrapper.unmount()
  })
})

describe('skillDetail command choice', () => {
  it('tabs run and install on small screens, and stacks run above install in the rail', async () => {
    const wrapper = await mountSuspended(
      await import('../../layers/registry/app/components/SkillDetail.vue').then(module => module.default),
      { props: { owner: 'antfu', repo: 'skills', name: 'vite' } },
    )

    const [tabs, stacked] = await vi.waitFor(() => {
      const matches = wrapper.findAll('[data-testid="skill-command-panel"]')
      expect(matches).toHaveLength(2)
      return matches
    })

    expect(tabs!.findAll('.install-command')).toHaveLength(1)
    expect(tabs!.get('.install-command').text()).toBe('https://skilld.dev/gh/antfu/skills/vite')
    expect(tabs!.text()).toContain('Use this Skill:')
    const installTab = tabs!.findAll('button[aria-pressed]').find(button => button.text() === 'Install')
    expect(installTab, 'Install mode is missing').toBeTruthy()
    await installTab!.trigger('click')
    await vi.waitFor(() => {
      expect(tabs!.get('.install-command').text()).toBe('npx skilld install antfu/skills/vite')
    })

    expect(stacked!.findAll('.install-command').map(command => command.text())).toEqual([
      'https://skilld.dev/gh/antfu/skills/vite',
      'npx skilld install antfu/skills/vite',
    ])
    expect(stacked!.get('button[aria-label="Copy Agent prompt"]')).toBeTruthy()
    expect(stacked!.get('button[aria-label="Copy install command"]')).toBeTruthy()

    wrapper.unmount()
  })
})

describe('skillDetail badge utility', () => {
  it('shows the minimal README badge editor without a login gate', async () => {
    const wrapper = await mountSuspended(
      await import('../../layers/registry/app/components/SkillDetail.vue').then(module => module.default),
      { props: { owner: 'antfu', repo: 'skills', name: 'vite' } },
    )

    const badgeUtility = await vi.waitFor(() => {
      const section = wrapper.find('section[aria-labelledby="readme-badge-heading"]')
      expect(section.exists()).toBe(true)
      return section
    })
    const preview = badgeUtility.get('[data-testid="minimal-badge-light"]')
    expect(preview.attributes('src')).toBe('/b/antfu/skills/vite?theme=light&label=0')
    expect(badgeUtility.get('button[aria-label="Configure README badge"]')).toBeTruthy()

    wrapper.unmount()
  })
})

describe('skill command copy feedback', () => {
  it('announces copy failures next to the command', async () => {
    const wrapper = await mountSuspended(
      await import('../../layers/registry/app/components/_SkillCommandPanel.vue').then(module => module.default),
      {
        props: {
          modelValue: 'run',
          runUrl: 'https://skilld.dev/gh/antfu/skills/vite',
          installCommand: 'npx skilld install antfu/skills/vite',
          runCopied: false,
          installCopied: false,
          copyError: 'Could not copy. Select the command and copy it manually.',
        },
      },
    )

    const status = wrapper.get('[aria-live="polite"]')
    expect(status.text()).toBe('Could not copy. Select the command and copy it manually.')
    expect(wrapper.get('button[aria-label="Copy Agent prompt"]').attributes('aria-describedby'))
      .toBe(status.attributes('id'))

    wrapper.unmount()
  })
})

describe('skillDetail run copy telemetry', () => {
  it('records the hero copy as mode run', async () => {
    // vueuse falls back to execCommand when clipboard-write is not granted.
    const execCommandDescriptor = Object.getOwnPropertyDescriptor(document, 'execCommand')
    const copied: string[] = []
    const clipboard = vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({
      writeText: (text: string) => {
        copied.push(text)
        return Promise.resolve()
      },
    } as unknown as Clipboard)
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => {
        const textarea = document.querySelector('textarea')
        if (textarea)
          copied.push(textarea.value)
        return true
      }),
    })
    installEvents.length = 0

    const wrapper = await mountSuspended(
      await import('../../layers/registry/app/components/SkillDetail.vue').then(module => module.default),
      { props: { owner: 'antfu', repo: 'skills', name: 'vite' } },
    )

    const copyButton = await vi.waitFor(() => {
      const button = wrapper.findAll('button')
        .find(candidate => candidate.attributes('aria-label') === 'Copy Agent prompt')
      expect(button, 'skill detail is missing its run copy button').toBeTruthy()
      return button!
    })

    await copyButton.trigger('click')
    await flushPromises()

    expect(copied).toContain('Use this Skill: https://skilld.dev/gh/antfu/skills/vite')

    await vi.waitFor(() => {
      expect(installEvents).toContainEqual(expect.objectContaining({
        surface: 'skill-page-hero',
        mode: 'run',
      }))
    })

    wrapper.unmount()
    clipboard.mockRestore()
    if (execCommandDescriptor)
      Object.defineProperty(document, 'execCommand', execCommandDescriptor)
    else
      Reflect.deleteProperty(document, 'execCommand')
  })
})
