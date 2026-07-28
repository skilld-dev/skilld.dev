/**
 * Pain-point clusters surfaced on the homepage grid + `/skills/<slug>` pages.
 *
 * Stable slugs — these become URLs forever. Do not rename. Add new clusters
 * at the end. Each cluster aggregates one or more `category` values produced
 * by the abstractness classifier (`skill_generated.kind='abstractness'`).
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
    label: 'Plan before it codes',
    icon: 'i-lucide-list-checks',
    userVoice: 'Turn a rough idea into a plan the agent can work through.',
    categories: ['planning', 'testing-strategy'],
    pinnedExamples: [
      'obra/brainstorming',
      'obra/writing-plans',
      'obra/executing-plans',
      'obra/test-driven-development',
      'github/prd',
    ],
  },
  {
    slug: 'master-agent',
    label: 'Run a proper agent workflow',
    icon: 'i-lucide-zap',
    userVoice: 'Split work, delegate independent tasks, and verify each result.',
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
    label: 'Write docs and specs',
    icon: 'i-lucide-pencil-line',
    userVoice: 'Draft READMEs, PRDs, and team updates without the usual AI filler.',
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
    label: 'Review or refactor code',
    icon: 'i-lucide-eye',
    userVoice: 'Get a second pass on the code, then refactor without changing behaviour.',
    categories: ['code-review', 'refactor'],
    pinnedExamples: [
      'obra/requesting-code-review',
      'obra/receiving-code-review',
      'github/refactor',
      'github/web-design-reviewer',
      'github/review-and-refactor',
    ],
  },
  {
    slug: 'debug',
    label: 'Track down a bug',
    icon: 'i-lucide-bug',
    userVoice: 'Reproduce it, isolate the cause, then make the smallest fix.',
    categories: ['debugging', 'browser-automation'],
    pinnedExamples: [
      'obra/systematic-debugging',
      'browser-use/browser-use',
      'github/web-design-reviewer',
    ],
  },
  {
    slug: 'ship',
    label: 'Finish and ship',
    icon: 'i-lucide-git-branch',
    userVoice: 'Prepare clean commits, branches, and release notes that fit the repo.',
    categories: ['git-workflow', 'devops'],
    pinnedExamples: [
      'obra/using-git-worktrees',
      'obra/finishing-a-development-branch',
      'github/git-commit',
      'github/conventional-commit',
      'jimliu/release-skills',
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
