import type { AxeResults, RunOptions } from 'axe-core'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import axe from 'axe-core'
import { defineComponent, h, nextTick } from 'vue'

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

  it('agentSetup has no violations', async () => {
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await import('~/components/AgentSetup.vue').then(m => m.default),
      {
        attachTo: container,
        props: {
          command: 'npx skilld add gh:obra/superpowers -s brainstorming',
          docUrl: 'https://skilld.dev/api/skills-raw/obra/superpowers/brainstorming',
          target: { kind: 'skill', owner: 'obra', name: 'brainstorming' },
          surface: 'skill-page-hero',
        },
      },
    )
    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)
    wrapper.unmount()
  })

  it('agentSetupPanel has no violations', async () => {
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await import('~/components/AgentSetupPanel.vue').then(m => m.default),
      {
        attachTo: container,
        props: {
          agent: {
            id: 'claude-code',
            label: 'Claude Code',
            icon: 'i-simple-icons-claudecode',
            projectDir: '.claude/skills',
            globalDir: '~/.claude/skills',
            verify: 'Start a new Claude Code session. Skills load automatically.',
          },
          command: 'npx skilld add gh:obra/superpowers -s brainstorming',
          docUrl: 'https://skilld.dev/api/skills-raw/obra/superpowers/brainstorming',
        },
      },
    )
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
    'EditorialMasthead', // Presentational masthead section, tested at page level
    'OutcomeClusterGrid', // Content section (fetches /api/clusters), tested at page level
    'KeyboardShortcutsModal.client', // Client-only modal requires full app context
    'NoiseField.client', // Decorative client-only canvas
    'OgBrand', // OG image component, rendered server-side only
    'OgLayout', // OG image layout component, rendered server-side only
    'SkillCard', // Tested at page level
    'SkillReceiptsBadge', // Tested at page level
    'SkillReceiptsPanel', // Tested at page level
    'StatsBars', // Decorative chart, tested at page level
    'StatsHBar', // Decorative chart, tested at page level
    'StatsLeaderboard', // Tested at page level
    'StatsScatter', // Decorative chart, tested at page level
    'UiTooltip', // Wrapper around UTooltip, exercised by parent components
  ]

  it('all non-skipped components have a11y tests', async () => {
    // This test ensures we don't forget to add a11y tests for new components
    const fs = await import('node:fs')
    const path = await import('node:path')
    const componentsDir = path.resolve(__dirname, '../app/components')

    if (!fs.existsSync(componentsDir))
      return

    const componentFiles = fs.readdirSync(componentsDir)
      .filter((f: string) => f.endsWith('.vue'))
      .map((f: string) => f.replace('.vue', ''))

    const untestedComponents = componentFiles.filter(
      (name: string) => !SKIPPED_COMPONENTS.includes(name),
    )

    // Each non-skipped component should have a corresponding test above
    // If this test fails, add an axe-core test for the new component
    for (const name of untestedComponents) {
      expect(
        SKIPPED_COMPONENTS.includes(name) || [
          'AgentSetup',
          'AgentSetupPanel',
          'AppLogo',
          'CompactPageHeader',
          'SkillSearchPanel',
          'SkillSearchRepositoryModal.client',
          'SkillSearchTrigger',
          'SkillSourceList',
          'SkillTable',
        ].includes(name),
        `Component "${name}" needs an accessibility test or should be added to SKIPPED_COMPONENTS with a reason`,
      ).toBe(true)
    }
  })
})
