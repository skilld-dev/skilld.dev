/**
 * Fixed taxonomy for skill tagging. Classifier picks 1-3 tags per skill.
 * Stable slugs — these become URLs (`/skills/tag/:slug`) so renames are
 * breaking. Add new tags at the end; don't rename existing ones.
 */

export interface Tag {
  slug: string
  label: string
  description: string
}

export const TAXONOMY: Tag[] = [
  { slug: 'frontend', label: 'Frontend', description: 'UI frameworks, component work, CSS, design systems' },
  { slug: 'backend', label: 'Backend', description: 'Server code, business logic, request handling' },
  { slug: 'database', label: 'Database', description: 'SQL/NoSQL, ORMs, migrations, query tuning' },
  { slug: 'testing', label: 'Testing', description: 'Unit/integration/e2e tests, snapshots, coverage' },
  { slug: 'devops', label: 'DevOps', description: 'CI/CD, deployment, containers, orchestration' },
  { slug: 'infrastructure', label: 'Infrastructure', description: 'Cloud resources, IaC, networking, cost' },
  { slug: 'api', label: 'API', description: 'REST/GraphQL/RPC design, client generation' },
  { slug: 'auth', label: 'Auth', description: 'Authentication, OAuth, sessions, identity' },
  { slug: 'security', label: 'Security', description: 'Vulnerability scanning, secrets, hardening' },
  { slug: 'performance', label: 'Performance', description: 'Profiling, optimization, benchmarking' },
  { slug: 'refactoring', label: 'Refactoring', description: 'Code transforms, AST edits, renames' },
  { slug: 'documentation', label: 'Documentation', description: 'Docs, changelogs, release notes, READMEs' },
  { slug: 'review', label: 'Code review', description: 'PR review, quality audits, style enforcement' },
  { slug: 'debugging', label: 'Debugging', description: 'Bug hunting, stack traces, log analysis' },
  { slug: 'typescript', label: 'TypeScript', description: 'Type-heavy workflows, generics, type audits' },
  { slug: 'python', label: 'Python', description: 'Python-specific patterns and tooling' },
  { slug: 'rust', label: 'Rust', description: 'Rust-specific patterns and tooling' },
  { slug: 'go', label: 'Go', description: 'Go-specific patterns and tooling' },
  { slug: 'nuxt', label: 'Nuxt', description: 'Nuxt modules, server routes, Nitro' },
  { slug: 'vue', label: 'Vue', description: 'Vue components, composables, reactivity' },
  { slug: 'react', label: 'React', description: 'React components, hooks, state mgmt' },
  { slug: 'ai', label: 'AI/ML', description: 'LLM apps, embeddings, prompt engineering' },
  { slug: 'data', label: 'Data', description: 'ETL, pipelines, analytics, notebooks' },
  { slug: 'seo', label: 'SEO', description: 'Search optimization, structured data, sitemaps' },
  { slug: 'content', label: 'Content', description: 'Writing, editing, publishing workflows' },
  { slug: 'design', label: 'Design', description: 'Visual design, brand, style systems' },
  { slug: 'git', label: 'Git/VCS', description: 'Git operations, branching, history surgery' },
  { slug: 'cli', label: 'CLI', description: 'Command-line tools, scripting, shell' },
  { slug: 'package', label: 'Packaging', description: 'npm/PyPI/cargo publishing, monorepos' },
  { slug: 'mcp', label: 'MCP', description: 'Model Context Protocol servers/clients' },
]

export const TAG_BY_SLUG: Map<string, Tag> = new Map(TAXONOMY.map(t => [t.slug, t]))

export const TAXONOMY_HINT = TAXONOMY.map(t => `- ${t.slug}: ${t.label} — ${t.description}`).join('\n')
