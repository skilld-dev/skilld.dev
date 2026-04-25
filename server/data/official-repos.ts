export type OfficialKind = 'org' | 'user'

export interface OfficialRepo {
  owner: string
  repo: string
  skills: number
  kind: OfficialKind
}

/**
 * Curated list of official skill repositories.
 *
 * - kind: 'org': skills published by the company/organization that builds the
 *   underlying technology (e.g. anthropics/skills, vercel/ai).
 * - kind: 'user': skills published by an individual developer's own repo
 *   (e.g. antfu/skills, garrytan/gstack). Treated as official because the
 *   developer is the authoritative voice for that stack.
 *
 * Org entries seeded from skills.sh/official on 2026-03-30. User entries
 * seeded from registry on 2026-04-25 (top personal-scale repos by installs).
 * Maintained manually.
 */
export const officialRepos: OfficialRepo[] = [
  { owner: 'anthropics', repo: 'skills', skills: 11, kind: 'org' },
  { owner: 'apify', repo: 'agent-skills', skills: 2, kind: 'org' },
  { owner: 'apollographql', repo: 'skills', skills: 1, kind: 'org' },
  { owner: 'auth0', repo: 'agent-skills', skills: 1, kind: 'org' },
  { owner: 'automattic', repo: 'agent-skills', skills: 5, kind: 'org' },
  { owner: 'axiomhq', repo: 'skills', skills: 2, kind: 'org' },
  { owner: 'base', repo: 'skills', skills: 3, kind: 'org' },
  { owner: 'better-auth', repo: 'skills', skills: 2, kind: 'org' },
  { owner: 'bitwarden', repo: 'ai-plugins', skills: 3, kind: 'org' },
  { owner: 'box', repo: 'box-for-ai', skills: 1, kind: 'org' },
  { owner: 'brave', repo: 'brave-search-skills', skills: 1, kind: 'org' },
  { owner: 'browser-use', repo: 'browser-use', skills: 1, kind: 'org' },
  { owner: 'browserbase', repo: 'skills', skills: 4, kind: 'org' },
  { owner: 'callstackincubator', repo: 'agent-skills', skills: 5, kind: 'org' },
  { owner: 'clerk', repo: 'skills', skills: 1, kind: 'org' },
  { owner: 'clickhouse', repo: 'agent-skills', skills: 2, kind: 'org' },
  { owner: 'cloudflare', repo: 'skills', skills: 8, kind: 'org' },
  { owner: 'coderabbitai', repo: 'skills', skills: 2, kind: 'org' },
  { owner: 'coinbase', repo: 'agentic-wallet-skills', skills: 1, kind: 'org' },
  { owner: 'dagster-io', repo: 'erk', skills: 4, kind: 'org' },
  { owner: 'datadog-labs', repo: 'agent-skills', skills: 2, kind: 'org' },
  { owner: 'dbt-labs', repo: 'dbt-agent-skills', skills: 2, kind: 'org' },
  { owner: 'denoland', repo: 'skills', skills: 1, kind: 'org' },
  { owner: 'elevenlabs', repo: 'skills', skills: 2, kind: 'org' },
  { owner: 'encoredev', repo: 'skills', skills: 1, kind: 'org' },
  { owner: 'expo', repo: 'skills', skills: 2, kind: 'org' },
  { owner: 'facebook', repo: 'react', skills: 2, kind: 'org' },
  { owner: 'figma', repo: 'mcp-server-guide', skills: 1, kind: 'org' },
  { owner: 'firebase', repo: 'agent-skills', skills: 4, kind: 'org' },
  { owner: 'firecrawl', repo: 'cli', skills: 8, kind: 'org' },
  { owner: 'flutter', repo: 'skills', skills: 3, kind: 'org' },
  { owner: 'getsentry', repo: 'skills', skills: 13, kind: 'org' },
  { owner: 'github', repo: 'awesome-copilot', skills: 5, kind: 'org' },
  { owner: 'google-gemini', repo: 'gemini-skills', skills: 3, kind: 'org' },
  { owner: 'google-labs-code', repo: 'stitch-skills', skills: 3, kind: 'org' },
  { owner: 'hashicorp', repo: 'agent-skills', skills: 4, kind: 'org' },
  { owner: 'huggingface', repo: 'skills', skills: 3, kind: 'org' },
  { owner: 'kotlin', repo: 'kotlin-agent-skills', skills: 1, kind: 'org' },
  { owner: 'langchain-ai', repo: 'langchain-skills', skills: 6, kind: 'org' },
  { owner: 'langfuse', repo: 'skills', skills: 2, kind: 'org' },
  { owner: 'launchdarkly', repo: 'agent-skills', skills: 1, kind: 'org' },
  { owner: 'livekit', repo: 'agent-skills', skills: 1, kind: 'org' },
  { owner: 'makenotion', repo: 'claude-code-notion-plugin', skills: 4, kind: 'org' },
  { owner: 'mapbox', repo: 'mapbox-agent-skills', skills: 2, kind: 'org' },
  { owner: 'mastra-ai', repo: 'skills', skills: 3, kind: 'org' },
  { owner: 'mcp-use', repo: 'mcp-use', skills: 2, kind: 'org' },
  { owner: 'medusajs', repo: 'medusa-agent-skills', skills: 2, kind: 'org' },
  { owner: 'microsoft', repo: 'github-copilot-for-azure', skills: 23, kind: 'org' },
  { owner: 'n8n-io', repo: 'n8n', skills: 1, kind: 'org' },
  { owner: 'neondatabase', repo: 'agent-skills', skills: 6, kind: 'org' },
  { owner: 'nuxt', repo: 'ui', skills: 1, kind: 'org' },
  { owner: 'openai', repo: 'skills', skills: 6, kind: 'org' },
  { owner: 'openshift', repo: 'hypershift', skills: 3, kind: 'org' },
  { owner: 'planetscale', repo: 'database-skills', skills: 2, kind: 'org' },
  { owner: 'posthog', repo: 'posthog', skills: 5, kind: 'org' },
  { owner: 'prisma', repo: 'skills', skills: 2, kind: 'org' },
  { owner: 'pulumi', repo: 'agent-skills', skills: 2, kind: 'org' },
  { owner: 'pytorch', repo: 'pytorch', skills: 1, kind: 'org' },
  { owner: 'redis', repo: 'agent-skills', skills: 2, kind: 'org' },
  { owner: 'remotion-dev', repo: 'skills', skills: 2, kind: 'org' },
  { owner: 'resend', repo: 'resend-skills', skills: 6, kind: 'org' },
  { owner: 'rivet-dev', repo: 'skills', skills: 3, kind: 'org' },
  { owner: 'runwayml', repo: 'skills', skills: 1, kind: 'org' },
  { owner: 'sanity-io', repo: 'agent-toolkit', skills: 4, kind: 'org' },
  { owner: 'semgrep', repo: 'skills', skills: 3, kind: 'org' },
  { owner: 'streamlit', repo: 'agent-skills', skills: 2, kind: 'org' },
  { owner: 'stripe', repo: 'ai', skills: 4, kind: 'org' },
  { owner: 'supabase', repo: 'agent-skills', skills: 2, kind: 'org' },
  { owner: 'sveltejs', repo: 'mcp', skills: 2, kind: 'org' },
  { owner: 'tavily-ai', repo: 'skills', skills: 2, kind: 'org' },
  { owner: 'tinybirdco', repo: 'tinybird-agent-skills', skills: 1, kind: 'org' },
  { owner: 'tldraw', repo: 'tldraw', skills: 1, kind: 'org' },
  { owner: 'triggerdotdev', repo: 'skills', skills: 2, kind: 'org' },
  { owner: 'upstash', repo: 'context', skills: 7, kind: 'org' },
  { owner: 'vercel', repo: 'ai', skills: 23, kind: 'org' },
  { owner: 'vercel-labs', repo: 'agent-skills', skills: 32, kind: 'org' },
  { owner: 'webflow', repo: 'webflow-skills', skills: 1, kind: 'org' },
  { owner: 'wix', repo: 'skills', skills: 2, kind: 'org' },
  { owner: 'wordpress', repo: 'agent-skills', skills: 1, kind: 'org' },

  // Individual developers publishing their own skill repos.
  { owner: 'obra', repo: 'superpowers', skills: 14, kind: 'user' },
  { owner: 'antfu', repo: 'skills', skills: 17, kind: 'user' },
  { owner: 'jimliu', repo: 'baoyu-skills', skills: 18, kind: 'user' },
  { owner: 'pbakaus', repo: 'impeccable', skills: 18, kind: 'user' },
  { owner: 'kepano', repo: 'obsidian-skills', skills: 5, kind: 'user' },
  { owner: 'addyosmani', repo: 'web-quality-skills', skills: 6, kind: 'user' },
  { owner: 'mattpocock', repo: 'skills', skills: 10, kind: 'user' },
  { owner: 'ibelick', repo: 'ui-skills', skills: 5, kind: 'user' },
  { owner: 'brianlovin', repo: 'claude-config', skills: 18, kind: 'user' },
  { owner: 'dimillian', repo: 'skills', skills: 11, kind: 'user' },
  { owner: 'onmax', repo: 'nuxt-skills', skills: 19, kind: 'user' },
  { owner: 'hyf0', repo: 'vue-skills', skills: 11, kind: 'user' },
]
