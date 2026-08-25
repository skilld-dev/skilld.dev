import type { AxeResults, RunOptions } from 'axe-core'
import type { WeeklyDemoResponse } from '../../server/api/weekly/demo.get'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import axe from 'axe-core'
import { defineComponent, h, nextTick, ref } from 'vue'

// Only WeeklyBand (and the page-level-tested OutcomeClusterGrid) call useFetch
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
      await import('~/components/AppLogo.vue').then(m => m.default),
      { attachTo: container },
    )
    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)
    wrapper.unmount()
  })

  it('installCommand has no violations and keeps the command copyable as one string', async () => {
    const container = createIsolatedContainer()
    const command = 'npx skilld add gh:obra/superpowers -s brainstorming'
    const wrapper = await mountSuspended(
      await import('~/components/InstallCommand.vue').then(m => m.default),
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
      await import('~/components/AgentTargets.vue').then(m => m.default),
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
    const AgentTargets = await import('~/components/AgentTargets.vue').then(m => m.default)
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

  it('likeButton has no violations when signed out', async () => {
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await import('../layers/identity/app/components/LikeButton.client.vue').then(m => m.default),
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
  })

  it('skillSourceList has no violations', async () => {
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await import('~/components/SkillSourceList.vue').then(m => m.default),
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

  it('skillTable has no violations', async () => {
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await import('~/components/SkillTable.vue').then(m => m.default),
      {
        attachTo: container,
        props: {
          skills: [{
            owner: 'antfu',
            repo: 'skills',
            name: 'vite',
            slug: 'antfu/vite',
            description: 'Vite configuration conventions.',
            stars: 1200,
            modifiedAt: 1_760_000_000,
            official: true,
          }],
          ariaLabel: 'All skills',
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
      await import('~/components/CompactPageHeader.vue').then(m => m.default),
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
      await import('~/components/SkillSearchPanel.vue').then(m => m.default),
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
      await import('~/components/SkillSearchTrigger.vue').then(m => m.default),
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

  it('weeklyBand has no violations and hides the inbox preview from assistive tech', async () => {
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await import('~/components/WeeklyBand.vue').then(m => m.default),
      { attachTo: container },
    )

    // The demo card is the real email with roughly twenty live links; the band
    // must keep it out of the tab order and the accessibility tree.
    const frame = container.querySelector('.home-weekly-frame')
    expect(frame?.getAttribute('aria-hidden')).toBe('true')
    expect(frame?.getAttribute('tabindex')).toBe('-1')
    expect(container.querySelector('#weekly-heading')?.tagName).toBe('H2')

    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)
    wrapper.unmount()
  })

  it('skillSearchRepositoryModal has no violations while indexing', async () => {
    const container = createIsolatedContainer()
    const Modal = await import('~/components/SkillSearchRepositoryModal.client.vue').then(m => m.default)
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
})

describe('accessibility: component coverage', () => {
  // Components that are skipped with documented reasons
  const SKIPPED_COMPONENTS = [
    'OutcomeClusterGrid', // Content section (fetches /api/clusters), tested at page level
    'KeyboardShortcutsModal.client', // Client-only modal requires full app context
    'NoiseField.client', // Decorative client-only canvas
    'OgBrand', // OG image component, rendered server-side only
    'OgLayout', // OG image layout component, rendered server-side only
    'SkillCard', // Tested at page level
    'SkillReceiptsBadge', // Tested at page level
    'StatsBars', // Decorative chart, tested at page level
    'StatsHBar', // Decorative chart, tested at page level
    'StatsLeaderboard', // Tested at page level
    'UiTooltip', // Wrapper around UTooltip, exercised by parent components
  ]

  // Read from the `it()` blocks in this file, not from a second hand-kept
  // list: deleting a component's axe test must fail this guard.
  async function testedComponents(): Promise<Set<string>> {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const source = fs.readFileSync(path.resolve(__dirname, 'a11y.spec.ts'), 'utf8')
    const tested = new Set<string>()

    for (const block of source.split(/\bit\(/).slice(1)) {
      for (const match of block.matchAll(/components\/([\w.]+)\.vue/g))
        tested.add(match[1]!)
    }
    return tested
  }

  it('derives its tested set from the axe tests in this file', async () => {
    const tested = await testedComponents()
    expect(tested.has('AgentTargets')).toBe(true)
    expect(tested.has('SkillCard')).toBe(false)
  })

  it('covers every component with an axe test or a documented skip', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const componentsDir = path.resolve(__dirname, '../app/components')
    const tested = await testedComponents()

    const componentFiles = fs.readdirSync(componentsDir)
      .filter((f: string) => f.endsWith('.vue'))
      .map((f: string) => f.replace('.vue', ''))

    for (const name of componentFiles) {
      expect(
        tested.has(name) || SKIPPED_COMPONENTS.includes(name),
        `Component "${name}" needs an accessibility test or should be added to SKIPPED_COMPONENTS with a reason`,
      ).toBe(true)
    }
  })

  it('keeps no skip for a component that no longer exists', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const componentsDir = path.resolve(__dirname, '../app/components')
    const componentFiles = new Set(fs.readdirSync(componentsDir)
      .filter((f: string) => f.endsWith('.vue'))
      .map((f: string) => f.replace('.vue', '')))

    for (const name of SKIPPED_COMPONENTS)
      expect(componentFiles.has(name), `SKIPPED_COMPONENTS lists "${name}", which no longer exists`).toBe(true)
  })
})
