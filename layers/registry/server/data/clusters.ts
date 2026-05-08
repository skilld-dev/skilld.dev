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
    userVoice: 'I want my agent to brainstorm, plan, then execute step by step.',
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
    label: 'Master your agent',
    icon: 'i-lucide-zap',
    userVoice: 'I want sub-agents, verification, and parallel execution — not a single chat.',
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
    label: 'Help me write docs & specs',
    icon: 'i-lucide-pencil-line',
    userVoice: 'I want READMEs, PRDs, and internal comms — without the AI slop.',
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
    label: 'Review and refactor my code',
    icon: 'i-lucide-eye',
    userVoice: 'I want a second reviewer and clean refactors that keep behaviour stable.',
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
    label: 'Debug like an engineer',
    icon: 'i-lucide-bug',
    userVoice: 'I want my agent to investigate before guessing — reproduce, isolate, then fix.',
    categories: ['debugging', 'browser-automation'],
    pinnedExamples: [
      'obra/systematic-debugging',
      'browser-use/browser-use',
      'github/web-design-reviewer',
    ],
  },
  {
    slug: 'ship',
    label: 'Ship cleanly',
    icon: 'i-lucide-git-branch',
    userVoice: 'I want commits, branches, and releases that match how the team ships.',
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
