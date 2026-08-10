/**
 * Work tracks surfaced on the homepage self-selector + `/skills/<slug>` pages.
 *
 * `label` names the work a visitor does; `userVoice` is written to them in
 * second person so the grid reads as "pick yourself", not "pick a task".
 *
 * Stable slugs: these become URLs forever. Do not rename. Add new tracks at
 * the end. Each track aggregates one or more `category` values produced by the
 * abstractness classifier (`skill_generated.kind='abstractness'`).
 *
 * `pinnedExamples` are hand-picked `owner/name` keys that always show on the
 * card, regardless of install rank. Up to 5; first 3 render in the grid.
 */

export interface Cluster {
  slug: string
  label: string
  icon: string
  userVoice: string
  categories: string[]
  pinnedExamples: string[]
}

export const CLUSTERS: Cluster[] = [
  {
    slug: 'plan',
    label: 'Planning and specs',
    icon: 'i-lucide-list-checks',
    userVoice: 'You turn rough ideas into plans, specs, and scoped work.',
    categories: ['planning', 'project-management'],
    pinnedExamples: [
      'obra/brainstorming',
      'obra/writing-plans',
      'obra/executing-plans',
      'n8n-io/spec-driven-development',
      'vercel/adr-skill',
    ],
  },
  {
    slug: 'master-agent',
    label: 'Agent workflows',
    icon: 'i-lucide-zap',
    userVoice: 'You run agents in parallel and verify what they hand back.',
    categories: ['agent-meta'],
    pinnedExamples: [
      'obra/using-superpowers',
      'obra/subagent-driven-development',
      'obra/verification-before-completion',
      'obra/dispatching-parallel-agents',
      'obra/writing-skills',
    ],
  },
  {
    slug: 'docs',
    label: 'Docs and writing',
    icon: 'i-lucide-pencil-line',
    userVoice: 'You write the READMEs, PRDs, and updates other people read.',
    categories: ['docs-writing', 'doc-writing', 'documentation', 'content-writing'],
    pinnedExamples: [
      'anthropics/doc-coauthoring',
      'github/documentation-writer',
      'github/create-readme',
      'anthropics/internal-comms',
      'github/prd',
    ],
  },
  {
    slug: 'review',
    label: 'Review and refactoring',
    icon: 'i-lucide-eye',
    userVoice: 'You read other people\'s code and reshape it without breaking it.',
    categories: ['code-review', 'refactor', 'refactoring'],
    pinnedExamples: [
      'obra/requesting-code-review',
      'obra/receiving-code-review',
      'github/refactor',
      'github/review-and-refactor',
      'ertugrul-dmr/clean-general',
    ],
  },
  {
    slug: 'debug',
    label: 'Debugging and incidents',
    icon: 'i-lucide-bug',
    userVoice: 'You chase failures down to a cause and write up what happened.',
    categories: ['debugging', 'browser-automation', 'incident-response'],
    pinnedExamples: [
      'obra/systematic-debugging',
      'deanpeters/autonomous-investigation',
      'boshu2/post-mortem',
    ],
  },
  {
    slug: 'ship',
    label: 'Shipping and release',
    icon: 'i-lucide-git-branch',
    userVoice: 'You own the commits, branches, and deploys at the end of the work.',
    categories: ['git-workflow', 'devops', 'deployment', 'ci-cd'],
    pinnedExamples: [
      'obra/using-git-worktrees',
      'obra/finishing-a-development-branch',
      'github/git-commit',
      'github/conventional-commit',
      'jimliu/release-skills',
    ],
  },
  {
    slug: 'design',
    label: 'Design and interface work',
    icon: 'i-lucide-palette',
    userVoice: 'You care how the interface looks, moves, and reads.',
    categories: ['design'],
    pinnedExamples: [
      'emilkowalski/animation-vocabulary',
      'dylantarre/web-motion-design',
      'simota/palette',
      'ctsstc/ui-brand',
      'davidortinau/ux-first-principles',
    ],
  },
  {
    slug: 'testing',
    label: 'Testing and QA',
    icon: 'i-lucide-flask-conical',
    userVoice: 'You want tests that prove the change, not tests that pass.',
    categories: ['testing', 'testing-strategy'],
    pinnedExamples: [
      'mattpocock/tdd',
      'obra/test-driven-development',
      'bitwarden/assessing-test-coverage',
      'github/playwright-explore-website',
      'wdm0006/verifying-external-behavior',
    ],
  },
  {
    slug: 'security',
    label: 'Security and auth',
    icon: 'i-lucide-shield',
    userVoice: 'You think about the threat model before the feature ships.',
    categories: ['security', 'auth'],
    pinnedExamples: [
      'wshobson/stride-analysis-patterns',
      'wshobson/auth-implementation-patterns',
      'github/audit-integrity',
      'bitwarden/bitwarden-security-context',
    ],
  },
  {
    slug: 'performance',
    label: 'Performance and data',
    icon: 'i-lucide-gauge',
    userVoice: 'You profile the slow path and model the data behind it.',
    categories: ['performance', 'data-modeling'],
    pinnedExamples: [
      'softaworks/react-useeffect',
      'supabase/supabase-postgres-best-practices',
      'github/csharp-async',
    ],
  },
]

export const CLUSTER_BY_SLUG: Map<string, Cluster> = new Map(CLUSTERS.map(c => [c.slug, c]))

/**
 * Categories surfaced via the cluster grid. Used to filter out long-tail
 * categories on the homepage but keep them browseable elsewhere.
 */
export const CLUSTERED_CATEGORIES: Set<string> = new Set(
  CLUSTERS.flatMap(c => c.categories),
)
