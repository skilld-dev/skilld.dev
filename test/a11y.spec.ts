import type { AxeResults, RunOptions } from 'axe-core'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import axe from 'axe-core'

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

  it('collectionCard has no violations', async () => {
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await import('~/components/CollectionCard.vue').then(m => m.default),
      {
        attachTo: container,
        props: {
          collection: {
            name: 'Test Collection',
            slug: 'test',
            description: 'A test collection',
            curator: { name: 'Test User', handle: 'testuser', avatar: 'https://example.com/avatar.png' },
            skillCount: 3,
            skills: ['vue', 'nuxt', 'typescript'],
            installs: 100,
            updated: '1d ago',
          },
        },
      },
    )
    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)
    wrapper.unmount()
  })

  it('curatorCard has no violations', async () => {
    const container = createIsolatedContainer()
    const wrapper = await mountSuspended(
      await import('~/components/CuratorCard.vue').then(m => m.default),
      {
        attachTo: container,
        props: {
          curator: {
            name: 'Test Curator',
            handle: 'testcurator',
            avatar: 'https://example.com/avatar.png',
            bio: 'A test curator bio',
            stacks: ['Vue', 'Nuxt', 'TypeScript', 'Tailwind'],
            collections: 2,
            skillCount: 10,
            updated: '3d ago',
          },
        },
      },
    )
    const results = await runAxe(container)
    expect(results.violations, formatViolations(results)).toHaveLength(0)
    wrapper.unmount()
  })
})

describe('accessibility: component coverage', () => {
  // Components that are skipped with documented reasons
  const SKIPPED_COMPONENTS = [
    'AuthModal.client', // Client-only modal requires full app context with auth providers
    'BlueskyThread', // Requires async fetch context (useFetch) for thread data
    'CollectionEditor.client', // Client-only editor requires auth and complex form state
    'CuratorLabels', // Simple label display, tested indirectly via CuratorCard
    'InlineTip.client', // Client-only component with slot content
    'KeyboardShortcutsModal.client', // Client-only modal requires full app context
    'OgBrand', // OG image component, rendered server-side only
    'OgLayout', // OG image layout component, rendered server-side only
    'WelcomeBanner.client', // Client-only banner requires auth context
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
        SKIPPED_COMPONENTS.includes(name) || ['AppLogo', 'CollectionCard', 'CuratorCard'].includes(name),
        `Component "${name}" needs an accessibility test or should be added to SKIPPED_COMPONENTS with a reason`,
      ).toBe(true)
    }
  })
})
