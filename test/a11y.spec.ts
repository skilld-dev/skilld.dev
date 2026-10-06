import type { AxeResults, RunOptions } from 'axe-core'
import type { Component } from 'vue'
import type { WeeklyDemoResponse } from '../../server/api/weekly/demo.get'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import axe from 'axe-core'
import { defineComponent, h, nextTick, ref } from 'vue'

// Only WeeklyEmailPreview (and the page-level-tested OutcomeClusterGrid) call useFetch
// among the components mounted here, so one file-wide mock covers it without
// touching the other cases.
const weeklyDemo = ref<WeeklyDemoResponse>({
  card: {
    light: '<table><tbody><tr><td>trending-skill</td></tr></tbody></table>',
    dark: '<table><tbody><tr><td>trending-skill</td></tr></tbody></table>',
  },
  rowCount: 3,
})

mockNuxtImport('useFetch', () => {
  return () => ({
    data: weeklyDemo,
    error: ref(undefined),
    status: ref('success'),
    refresh: async () => {},
  })
})

// Rules to disable for isolated component testing (page-level rules)
const AXE_OPTIONS: RunOptions = {
  resultTypes: ['violations'],
  rules: {
    'landmark-one-main': { enabled: false },
    'region': { enabled: false },
    'page-has-heading-one': { enabled: false },
    'landmark-no-duplicate-banner': { enabled: false },
    'landmark-no-duplicate-contentinfo': { enabled: false },
    'landmark-no-duplicate-main': { enabled: false },
  },
}

async function runAxe(container: Element): Promise<AxeResults> {
  return axe.run(container, AXE_OPTIONS)
}

function formatViolations(results: AxeResults): string {
  return results.violations
    .map(v => `[${v.id}] ${v.help} (${v.impact})\n  ${v.nodes.map(n => n.html).join('\n  ')}`)
    .join('\n\n')
}

/**
 * Every axe test loads its component through here, so the coverage guard at the
 * end of this file reads what actually mounted.
 *
 * The guard used to split this file's own source on `it(`, which credited a
 * skipped, commented-out, or `describe.skip` test to the component it named.
 */
const componentLoaders = import.meta.glob<{ default: Component }>('../app/components/**/*.vue')
const testedComponents = new Set<string>()

async function loadComponent(name: string): Promise<Component> {
  const loader = componentLoaders[`../app/components/${name}.vue`]
  if (!loader)
    throw new Error(`No component at app/components/${name}.vue`)

  testedComponents.add(name)
  return (await loader()).default
}

// Cleanup containers after each test
const containers: HTMLElement[] = []

function createIsolatedContainer(): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  containers.push(container)
  return container
}

afterEach(() => {
  containers.forEach(c => c.remove())
  containers.length = 0
})

describe('accessibility: components', () => {
  it('appLogo has no violations', async () => {
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await loadComponent('AppLogo'),
      { attachTo: container },
    )
    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)
    wrapper.unmount()
  })

  it('installCommand has no violations and keeps the command copyable as one string', async () => {
    const container = createIsolatedContainer()
    const command = 'npx skilld add obra/superpowers --agent codex'
    const wrapper = await mountSuspended(
      await loadComponent('InstallCommand'),
      { attachTo: container, props: { command } },
    )
    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)
    // Colouring the tokens must not change what a screen reader or a text
    // selection gets back out of the element.
    expect(container.textContent).toBe(command)
    wrapper.unmount()
  })

  it('agentTargets has no violations', async () => {
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await loadComponent('AgentTargets'),
      { attachTo: container },
    )
    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)
    wrapper.unmount()
  })

  // Skill detail mounts this twice, mobile and rail, and hides one with CSS
  // only, so both live in the DOM at every breakpoint.
  it('agentTargets keeps its ids unique when mounted twice', async () => {
    const container = createIsolatedContainer()
    const AgentTargets = await loadComponent('AgentTargets')
    const bothMounts = defineComponent({
      setup: () => () => h('div', [h(AgentTargets), h(AgentTargets)]),
    })
    const wrapper = await mountSuspended(bothMounts, { attachTo: container })

    const controls = [...container.querySelectorAll('[aria-controls]')]
      .map(el => el.getAttribute('aria-controls'))
    expect(new Set(controls).size).toBe(2)

    // axe skips hidden nodes, so expand both lists before the scan.
    for (const button of container.querySelectorAll('button'))
      (button as HTMLButtonElement).click()
    await nextTick()

    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)
    wrapper.unmount()
  })

  it('badgeEmbedControl has no violations in its inline state', async () => {
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await loadComponent('BadgeEmbedControl'),
      {
        attachTo: container,
        props: {
          owner: 'antfu',
          repo: 'skills',
          name: 'vite',
          registryPath: '/gh/antfu/skills/vite',
        },
      },
    )

    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)
    wrapper.unmount()
  })

  it('badgeReadmeSnippet has no violations', async () => {
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await loadComponent('BadgeReadmeSnippet'),
      {
        attachTo: container,
        props: {
          owner: 'antfu',
          repo: 'skills',
          name: 'vite',
          registryPath: '/gh/antfu/skills/vite',
        },
      },
    )

    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)
    wrapper.unmount()
  })

  it.each([
    { name: 'while the session loads', sessionKnown: false },
    { name: 'when signed out', sessionKnown: true },
  ])('likeButton has no violations $name', async ({ sessionKnown }) => {
    // nuxt-auth-utils marks the session known once the browser has asked for it.
    useState('nuxt-auth-ready').value = sessionKnown
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await import('../layers/identity/app/components/LikeButton.vue').then(m => m.default),
      {
        attachTo: container,
        props: {
          owner: 'nuxt',
          repo: 'ui',
          name: 'nuxt-ui',
          count: 12,
        },
      },
    )
    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)
    wrapper.unmount()
    useState('nuxt-auth-ready').value = false
  })

  it('skillSourceList has no violations', async () => {
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await loadComponent('SkillSourceList'),
      {
        attachTo: container,
        props: {
          items: [{
            owner: 'antfu',
            repo: 'skills',
            name: 'vite',
            displayName: 'Vite',
            maintainerName: 'Anthony Fu',
          }],
          variant: 'stream',
          ariaLabel: 'Person-authored skills',
        },
      },
    )
    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)
    wrapper.unmount()
  })

  it.each(['card', 'row', 'compact'] as const)('skillCard has no violations as a %s', async (layout) => {
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await loadComponent('SkillCard'),
      {
        attachTo: container,
        props: {
          skill: {
            owner: 'antfu',
            repo: 'skills',
            name: 'vite',
            registryPath: '/gh/antfu/skills/vite',
            description: 'Vite configuration conventions.',
            stars: 1200,
            authorName: 'Anthony Fu',
            official: true,
          },
          layout,
          rank: 1,
          note: 'The one to start with.',
          actions: ['run', 'source'],
        },
      },
    )
    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)
    wrapper.unmount()
  })

  it('compactPageHeader has no violations with context and controls', async () => {
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await loadComponent('CompactPageHeader'),
      {
        attachTo: container,
        props: {
          label: 'Community directory',
          title: 'Community',
          description: 'Explore creators and their published work.',
          headingId: 'community-heading',
        },
        slots: {
          aside: '<p>Five creators</p>',
          default: '<button type="button">All creators</button>',
        },
      },
    )

    expect(container.querySelector('h1')?.id).toBe('community-heading')
    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)
    wrapper.unmount()
  })

  it('skillSearchPanel has no violations in its resting state', async () => {
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await loadComponent('SkillSearchPanel'),
      { attachTo: container },
    )
    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)
    wrapper.unmount()
  })

  // The trigger is a combobox, so its ARIA wiring is the part most likely to
  // rot: aria-controls and aria-activedescendant must only reference the
  // listbox while it is actually rendered.
  it('skillSearchTrigger has no violations while closed', async () => {
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await loadComponent('SkillSearchTrigger'),
      { attachTo: container },
    )

    const combobox = container.querySelector('[role="combobox"]')
    expect(combobox).not.toBeNull()
    expect(combobox!.getAttribute('aria-expanded')).toBe('false')
    expect(combobox!.hasAttribute('aria-controls')).toBe(false)
    expect(combobox!.hasAttribute('aria-activedescendant')).toBe(false)

    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)
    wrapper.unmount()
  })

  // The hero search is a second combobox with the same wiring risk as the
  // trigger: while closed it must not point at a listbox that is not rendered.
  it('homeSearch has no violations while closed', async () => {
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await loadComponent('HomeSearch'),
      { attachTo: container },
    )

    const combobox = container.querySelector('[role="combobox"]')
    expect(combobox).not.toBeNull()
    expect(combobox!.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('[role="listbox"]')).toBeNull()

    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)
    wrapper.unmount()
  })

  it('weeklyEmailPreview has no violations and hides the inbox preview from assistive tech', async () => {
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await loadComponent('WeeklyEmailPreview'),
      { attachTo: container },
    )

    // The demo card is the real email with roughly twenty live links; the
    // preview must keep every one of them out of the tab order and the
    // accessibility tree. `inert` does both; a negative tabindex on the
    // container left the links inside focusable.
    const frame = container.querySelector('.home-weekly-frame')
    expect(frame?.getAttribute('aria-hidden')).toBe('true')
    expect(frame?.hasAttribute('inert')).toBe(true)
    expect(frame?.hasAttribute('tabindex')).toBe(false)

    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)
    wrapper.unmount()
  })

  it('skillSearchRepositoryModal has no violations while indexing', async () => {
    const container = createIsolatedContainer()
    const Modal = await loadComponent('SkillSearchRepositoryModal.client')
    const modalStub = defineComponent({
      inheritAttrs: false,
      props: { open: Boolean },
      setup(props, { attrs, slots }) {
        return () => props.open
          ? h('div', { ...attrs, 'role': 'dialog', 'aria-modal': 'true' }, slots.content?.())
          : null
      },
    })
    const harness = defineComponent({
      setup() {
        const { repositoryModalOpen, repositoryTask } = useSkillSearch()
        repositoryTask.value = {
          _tag: 'indexing',
          repository: {
            _tag: 'repository',
            owner: 'jonathanxdr',
            repo: 'nuxt-style-readme-skill',
            url: 'https://github.com/jonathanxdr/nuxt-style-readme-skill',
          },
          progress: { _tag: 'checking' },
        }
        repositoryModalOpen.value = true
        return () => h(Modal)
      },
    })
    const wrapper = await mountSuspended(harness, {
      attachTo: container,
      global: { stubs: { UModal: modalStub } },
    })
    await nextTick()

    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Repository indexing')
    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)
    wrapper.unmount()
  })

  it('collectionAvatar has no violations when the image fails', async () => {
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await loadComponent('collections/_CollectionAvatar'),
      { attachTo: container, props: { src: null, name: 'Design Engineering Essentials' } },
    )
    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)
    wrapper.unmount()
  })

  it('communityCreator has no violations', async () => {
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await loadComponent('community/_CommunityCreator'),
      {
        attachTo: container,
        props: {
          creator: {
            id: 1,
            login: 'harlan-zw',
            name: 'Harlan Wilton',
            avatar: 'https://github.com/harlan-zw.png',
            collectionCount: 3,
            skillCount: 12,
            featured: false,
            activityAt: 1_700_000_000,
            topCollection: {
              authorLogin: 'harlan-zw',
              slug: 'design-engineering-essentials',
              name: 'Design Engineering Essentials',
              preamble: 'The skills a design engineer reaches for daily.',
              skillCount: 8,
              skills: [{ owner: 'antfu', repo: 'skills', name: 'nuxt', displayName: 'Nuxt' }],
              updatedAt: 1_700_000_000,
            },
            topSkill: {
              owner: 'antfu',
              repo: 'skills',
              name: 'nuxt',
              displayName: 'Nuxt',
              description: 'Build full-stack Vue applications.',
              stars: 1200,
              modifiedAt: 1_700_000_000,
            },
          },
        },
      },
    )
    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)
    wrapper.unmount()
  })

  it('brailleSpark has no violations and names every count for a screen reader', async () => {
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await loadComponent('BrailleSpark'),
      { attachTo: container, props: { counts: [3, 5, 4, 8, 12, 19, 31] } },
    )
    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)
    expect(container.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('3, 5, 4, 8, 12, 19, 31')
    wrapper.unmount()
  })

  it('brailleSpark says one mention in the singular, on the page and to a screen reader', async () => {
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await loadComponent('BrailleSpark'),
      { attachTo: container, props: { counts: [0, 0, 0, 1, 0, 0, 0], period: 'in 7 days' } },
    )
    expect(container.querySelector('.braille-spark__total')?.textContent).toBe('1 mention in 7 days')
    expect(container.querySelector('[role="img"]')?.getAttribute('aria-label')).toMatch(/^1 mention in 7 days\. /)
    wrapper.unmount()
  })

  it('sparkDots has no violations and stays out of the accessibility tree', async () => {
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await loadComponent('SparkDots'),
      { attachTo: container, props: { levels: [0, 1, 2, 3, 4, 0, 2] } },
    )
    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    wrapper.unmount()
  })

  it('trendingMark has no violations and stays out of the accessibility tree', async () => {
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await loadComponent('TrendingMark'),
      { attachTo: container },
    )
    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)
    expect(container.querySelector('.trending-mark')?.getAttribute('aria-hidden')).toBe('true')
    wrapper.unmount()
  })

  it('commandChip has no violations and keeps the command copyable as one string', async () => {
    const container = createIsolatedContainer()
    const command = 'npx skilld run mattpocock/skills/tdd'
    const wrapper = await mountSuspended(
      await loadComponent('_CommandChip'),
      {
        attachTo: container,
        props: { command, mode: 'run', surface: 'test', target: { kind: 'skill', owner: 'mattpocock', name: 'tdd' } },
      },
    )
    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)
    expect(container.querySelector('code')?.textContent).toBe(command)
    wrapper.unmount()
  })

  it('runChip has no violations and its switch swaps the command and the consequence', async () => {
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await loadComponent('RunChip'),
      { attachTo: container, props: { owner: 'mattpocock', repo: 'skills', skill: 'tdd', surface: 'test' } },
    )
    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)
    expect(container.querySelector('code')?.textContent).toBe('npx skilld run mattpocock/skills/tdd')

    await wrapper.get('button[aria-pressed="false"]').trigger('click')
    await nextTick()

    expect(container.querySelector('code')?.textContent).toBe('npx skilld install mattpocock/skills/tdd')
    expect(container.textContent).toContain('Adds the Skill files and a lockfile entry.')
    wrapper.unmount()
  })

  it('homeLifecycle has no violations and links the three steps in order', async () => {
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await loadComponent('HomeLifecycle'),
      { attachTo: container },
    )
    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)

    const links = [...container.querySelectorAll('ol > li > a')]
    expect(links.map(link => link.getAttribute('href'))).toEqual([
      '/skills',
      '/cli#run',
      '/cli#update',
    ])
    // Run is the default, so it alone carries the rose dot.
    const picked = container.querySelectorAll('.home-lifecycle__node--picked')
    expect(picked).toHaveLength(1)
    expect(picked[0]!.closest('a')?.getAttribute('href')).toBe('/cli#run')
    wrapper.unmount()
  })

  it('headerNavigation opens the Developers panel with no violations', async () => {
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await loadComponent('_HeaderNavigation'),
      { attachTo: container },
    )
    const trigger = wrapper.get('#header-developers-trigger')
    expect(trigger.attributes('aria-expanded')).toBe('false')

    await trigger.trigger('click')
    await nextTick()

    expect(trigger.attributes('aria-expanded')).toBe('true')
    // reka-ui renders an aria-hidden focus proxy after an open trigger. It
    // moves focus into the panel as soon as it gets focus, and Shift+Tab skips
    // it, so focus never rests there. Only that span leaves the scan.
    const results = await axe.run(
      { include: [container], exclude: [['[data-navigation-menu-trigger] + span[aria-hidden="true"]']] },
      AXE_OPTIONS,
    )
    expect(results.violations, formatViolations(results)).toHaveLength(0)

    // The panel's label points at the fixed trigger id that replaces reka-ui's.
    const panel = container.querySelector('[aria-labelledby]')!
    expect(container.querySelector(`#${panel.getAttribute('aria-labelledby')}`)).toBe(trigger.element)
    expect([...panel.querySelectorAll('a')].map(link => link.getAttribute('href'))).toEqual([
      '/cli',
      '/developers?setup=mcp',
      '/developers?setup=api',
      '/make-skill',
      '/developers',
    ])
    wrapper.unmount()
  })

  it('runChip compact has no violations', async () => {
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await loadComponent('RunChip'),
      { attachTo: container, props: { owner: 'mattpocock', repo: 'skills', skill: 'tdd', surface: 'test', variant: 'compact' } },
    )
    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)
    wrapper.unmount()
  })

  it('homeDemos has no violations, and picking a prompt puts its demo on the stage', async () => {
    const shot = { src: '/demos/a/b/c/desktop.jpg', width: 1440, height: 900, alt: 'Desktop screenshot of the page', viewport: 'desktop' as const }
    const demos = ['one', 'two', 'three'].map(name => ({
      owner: 'anthropics',
      repo: 'skills',
      name,
      skillPath: `/gh/anthropics/skills/${name}`,
      authorName: 'Anthropic',
      sourceUrl: `https://github.com/anthropics/skills/blob/main/skills/${name}/SKILL.md`,
      prompt: `Build the ${name} page for Tidepool.`,
      agent: 'Claude Code',
      model: 'claude-opus-5-5',
      recordedAt: '2026-10-06',
      shots: [shot],
      video: null,
    }))
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await loadComponent('HomeDemos'),
      { attachTo: container, props: { demos } },
    )
    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)
    const picks = [...container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')]
    expect(picks).toHaveLength(3)
    expect(picks[0]?.getAttribute('aria-pressed')).toBe('true')
    const stage = () => container.querySelector('.home-demos__stage .home-demos__open')?.getAttribute('href')
    expect(stage()).toBe('/gh/anthropics/skills/one#demo')

    picks[1]!.click()
    await nextTick()
    await new Promise(done => setTimeout(done, 400))
    expect(picks[1]?.getAttribute('aria-pressed')).toBe('true')
    expect(stage()).toBe('/gh/anthropics/skills/two#demo')
    wrapper.unmount()
  })

  it('homeDemos stays hidden with fewer than three demos', async () => {
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await loadComponent('HomeDemos'),
      { attachTo: container, props: { demos: [] } },
    )
    expect(container.querySelector('#demos')).toBeNull()
    wrapper.unmount()
  })

  it('the Skill page demo panel has no violations and labels the output as recorded', async () => {
    const SkillDemo = (await import('../layers/registry/app/components/_SkillDemo.vue')).default
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(SkillDemo, {
      attachTo: container,
      props: {
        demo: {
          owner: 'anthropics',
          repo: 'skills',
          name: 'frontend-design',
          skillPath: '/gh/anthropics/skills/frontend-design',
          prompt: 'Build a landing page for Tidepool. Save it as index.html.',
          setup: null,
          video: null,
          authorName: 'Anthropic',
          sourceUrl: 'https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md',
          agent: 'Claude Code',
          model: 'claude-opus-5-5',
          skillCommit: '41bbe19d1a1a7eaab5e7bb9050a417e5c6cffc8f',
          recordedAt: '2026-10-06',
          outdated: true,
          liveUrl: '/demos/anthropics/skills/frontend-design/live',
          shots: [
            { src: '/demos/anthropics/skills/frontend-design/desktop.jpg', width: 1440, height: 900, alt: 'Desktop screenshot', viewport: 'desktop' },
            { src: '/demos/anthropics/skills/frontend-design/mobile.jpg', width: 390, height: 844, alt: 'Phone screenshot', viewport: 'mobile' },
          ],
        },
      },
    })
    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)
    expect(container.textContent).toContain('Recorded with Claude Code, Opus 5.5')
    expect(container.textContent).toContain('Recorded on an older version of this Skill.')

    await wrapper.get('button[aria-pressed="false"]').trigger('click')
    await nextTick()
    const frame = container.querySelector('iframe')
    expect(frame?.getAttribute('sandbox')).toBe('allow-scripts')
    expect(frame?.getAttribute('src')).toBe('/demos/anthropics/skills/frontend-design/live')
    wrapper.unmount()
  })

  it('skilldInstallChip has no violations', async () => {
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await loadComponent('SkilldInstallChip'),
      { attachTo: container, props: { surface: 'test' } },
    )
    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)
    expect(container.querySelector('code')?.textContent).toBe('npx skilld install skilld --global')
    wrapper.unmount()
  })

  it('copyText has no violations and names what its button copies', async () => {
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await loadComponent('CopyText'),
      { attachTo: container, props: { text: 'https://skilld.dev/api/mcp', label: 'MCP server URL' } },
    )
    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)
    expect(container.querySelector('button')?.getAttribute('aria-label')).toBe('Copy MCP server URL')
    wrapper.unmount()
  })

  it('homeAgents has no violations and links each Agent tile', async () => {
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await loadComponent('HomeAgents'),
      { attachTo: container },
    )
    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)

    const tiles = [...container.querySelectorAll('ul > li > a')]
    expect(tiles.map(tile => tile.getAttribute('href'))).toEqual([
      '/agents/claude-code',
      '/agents/cursor',
      '/agents/codex',
      '/agents/gemini-cli',
      '/agents/github-copilot',
      '/agents/windsurf',
      '/agents/opencode',
      '/developers?setup=mcp&app=claude',
      '/developers?setup=mcp&app=chatgpt',
      '/cli#install',
    ])
    expect(container.querySelectorAll('ol > li')).toHaveLength(3)
    wrapper.unmount()
  })

  it('cliInstallChip has no violations, leads with the native install, and switches platform', async () => {
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await loadComponent('CliInstallChip'),
      { attachTo: container, props: { surface: 'test' } },
    )
    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)
    expect(container.querySelector('code')?.textContent).toBe('curl -fsSL https://skilld.dev/install.sh | sh')
    expect(container.querySelector('button[aria-label]')?.getAttribute('aria-label')).toBe('Copy CLI install command')

    const option = (label: string) => wrapper.findAll('button[aria-pressed]').find(button => button.text() === label)!
    await option('Windows').trigger('click')
    await nextTick()
    expect(container.querySelector('code')?.textContent).toBe('irm https://skilld.dev/install.ps1 | iex')

    await option('npm').trigger('click')
    await nextTick()
    expect(container.querySelector('code')?.textContent).toBe('npm install --global skilld')
    expect(container.textContent).toContain('Needs Node.js.')
    wrapper.unmount()
  })

  it('changeGrid has no violations and steps to an older change from the keyboard', async () => {
    const container = createIsolatedContainer()
    const day = 86_400
    const now = 20_000 * day
    const wrapper = await mountSuspended(
      await loadComponent('ChangeGrid'),
      {
        attachTo: container,
        props: {
          name: 'tdd',
          now,
          fromFirst: true,
          changes: [
            { at: now - 2 * day, version: '2.1.0', note: 'Added a refactor checklist' },
            { at: now - 33 * day, version: '2.0.0', note: 'Split the red and green steps' },
          ],
        },
      },
    )
    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)
    expect(container.querySelector('[aria-live]')?.textContent).toContain('Added a refactor checklist')

    await wrapper.get('button').trigger('keydown', { key: 'ArrowLeft' })
    await nextTick()

    expect(container.querySelector('[aria-live]')?.textContent).toContain('Split the red and green steps')
    wrapper.unmount()
  })

  it('changeGrid with no changes has no violations', async () => {
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await loadComponent('ChangeGrid'),
      { attachTo: container, props: { name: 'tdd', now: 20_000 * 86_400, changes: [] } },
    )
    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)
    wrapper.unmount()
  })
})

describe('accessibility: component coverage', () => {
  // Components that are skipped with documented reasons
  const SKIPPED_COMPONENTS = [
    'OutcomeClusterGrid', // Content section (fetches /api/clusters), tested at page level
    'KeyboardShortcutsModal.client', // Client-only modal requires full app context
    'TextureBrailleNames.client', // Decorative client-only canvas, hidden from screen readers
    'TextureConverge.client', // Client-only canvas; its loading state is one role="status" with a text label
    'TextureFileMinimap.client', // Decorative client-only canvas, hidden from screen readers
    'OgBrand', // OG image component, rendered server-side only
    'OgLayout', // OG image layout component, rendered server-side only
    'OgLines', // OG image text component, rendered server-side only
    'skill-card/_SkillCardIdentity', // A part of SkillCard, scanned inside every SkillCard test
    'skill-card/_SkillCardMetric', // A part of SkillCard, scanned inside every SkillCard test
    'skill-card/_SkillCardRun', // A part of SkillCard, scanned inside every SkillCard test
    'SkillReceiptsBadge', // Tested at page level
    'StatsBars', // Decorative chart, tested at page level
    'StatsHBar', // Decorative chart, tested at page level
    'StatsLeaderboard', // Tested at page level
    'UiTooltip', // Wrapper around UTooltip, exercised by parent components
    '_ChipSwitch', // The switch above RunChip and CliInstallChip, axe-scanned and clicked through both
    'home-demos/_DemoMedia', // A part of HomeDemos, scanned inside the HomeDemos tests
    'home-demos/_DemoPicture', // A part of HomeDemos, scanned inside the HomeDemos tests
    'home-demos/_DemoRecording', // A part of HomeDemos, scanned inside the HomeDemos tests
    'home-demos/_DemoVideo', // A part of HomeDemos; its play rules need a real browser, checked by hand
  ]

  /**
   * `.takumi.vue` components are rendered by the OG image renderer into a
   * picture, never into a browser DOM, so axe has no tree to scan. Underscore
   * prefixes only keep a component out of Nuxt auto-imports, so those stay in
   * scope and need a test.
   */
  const OG_IMAGE_SUFFIX = '.takumi.vue'

  function componentNames(): string[] {
    const componentsDir = resolve(__dirname, '../app/components')
    return readdirSync(componentsDir, { recursive: true })
      .map(entry => String(entry).replaceAll('\\', '/'))
      .filter(file => file.endsWith('.vue') && !file.endsWith(OG_IMAGE_SUFFIX))
      .map(file => file.slice(0, -'.vue'.length))
  }

  it('records only the components an axe test actually mounted', () => {
    expect([...testedComponents]).toContain('AgentTargets')
    expect([...testedComponents]).not.toContain('SkillReceiptsBadge')
  })

  it('covers every component with an axe test or a documented skip', () => {
    for (const name of componentNames()) {
      expect(
        testedComponents.has(name) || SKIPPED_COMPONENTS.includes(name),
        `Component "${name}" needs an accessibility test or should be added to SKIPPED_COMPONENTS with a reason`,
      ).toBe(true)
    }
  })

  it('keeps no skip for a component that no longer exists', () => {
    const names = new Set(componentNames())

    for (const name of SKIPPED_COMPONENTS)
      expect(names.has(name), `SKIPPED_COMPONENTS lists "${name}", which no longer exists`).toBe(true)
  })

  it('finds the components in subdirectories too', () => {
    expect(componentNames()).toContain('community/_CommunityCreator')
  })
})
