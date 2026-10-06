export type OfficialKind = 'org' | 'user'

export interface OfficialRepo {
  owner: string
  repo: string
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
 * seeded from registry on 2026-04-25, then maintained as a reviewed list.
 * Maintained manually.
 *
 * A Repository GitHub moved keeps its old name here beside the new one, so
 * its Skills stay official on both sides of the registry move (ADR-0015).
 * Delete an old name once no registry row carries it.
 */
export const officialRepos: OfficialRepo[] = [
  { owner: 'anthropics', repo: 'skills', kind: 'org' },
  { owner: 'apify', repo: 'agent-skills', kind: 'org' },
  { owner: 'apollographql', repo: 'skills', kind: 'org' },
  { owner: 'auth0', repo: 'agent-skills', kind: 'org' },
  { owner: 'automattic', repo: 'agent-skills', kind: 'org' },
  { owner: 'axiomhq', repo: 'skills', kind: 'org' },
  { owner: 'base', repo: 'skills', kind: 'org' },
  { owner: 'better-auth', repo: 'skills', kind: 'org' },
  { owner: 'bitwarden', repo: 'ai-plugins', kind: 'org' },
  // Old name. ADR-0015 moves its rows to the entry below.
  { owner: 'box', repo: 'box-for-ai', kind: 'org' },
  { owner: 'box', repo: 'skills', kind: 'org' },
  { owner: 'brave', repo: 'brave-search-skills', kind: 'org' },
  { owner: 'browser-use', repo: 'browser-use', kind: 'org' },
  { owner: 'browserbase', repo: 'skills', kind: 'org' },
  { owner: 'callstackincubator', repo: 'agent-skills', kind: 'org' },
  { owner: 'clerk', repo: 'skills', kind: 'org' },
  { owner: 'clickhouse', repo: 'agent-skills', kind: 'org' },
  { owner: 'cloudflare', repo: 'skills', kind: 'org' },
  { owner: 'coderabbitai', repo: 'skills', kind: 'org' },
  { owner: 'coinbase', repo: 'agentic-wallet-skills', kind: 'org' },
  { owner: 'dagster-io', repo: 'erk', kind: 'org' },
  { owner: 'datadog-labs', repo: 'agent-skills', kind: 'org' },
  { owner: 'dbt-labs', repo: 'dbt-agent-skills', kind: 'org' },
  { owner: 'denoland', repo: 'skills', kind: 'org' },
  { owner: 'elevenlabs', repo: 'skills', kind: 'org' },
  { owner: 'encoredev', repo: 'skills', kind: 'org' },
  { owner: 'expo', repo: 'skills', kind: 'org' },
  // Old name. ADR-0015 moves its rows to the entry below.
  { owner: 'facebook', repo: 'react', kind: 'org' },
  { owner: 'react', repo: 'react', kind: 'org' },
  { owner: 'figma', repo: 'mcp-server-guide', kind: 'org' },
  { owner: 'firebase', repo: 'agent-skills', kind: 'org' },
  { owner: 'firecrawl', repo: 'cli', kind: 'org' },
  // Old name. ADR-0015 moves its rows to the entry below.
  { owner: 'flutter', repo: 'skills', kind: 'org' },
  { owner: 'flutter', repo: 'agent-plugins', kind: 'org' },
  { owner: 'getsentry', repo: 'skills', kind: 'org' },
  { owner: 'github', repo: 'awesome-copilot', kind: 'org' },
  { owner: 'google-gemini', repo: 'gemini-skills', kind: 'org' },
  { owner: 'google-labs-code', repo: 'stitch-skills', kind: 'org' },
  { owner: 'GoogleChrome', repo: 'modern-web-guidance', kind: 'org' },
  { owner: 'hashicorp', repo: 'agent-skills', kind: 'org' },
  { owner: 'huggingface', repo: 'skills', kind: 'org' },
  { owner: 'kotlin', repo: 'kotlin-agent-skills', kind: 'org' },
  { owner: 'langchain-ai', repo: 'langchain-skills', kind: 'org' },
  { owner: 'langfuse', repo: 'skills', kind: 'org' },
  // Old name. ADR-0015 moves its rows to the entry below.
  { owner: 'launchdarkly', repo: 'agent-skills', kind: 'org' },
  { owner: 'launchdarkly', repo: 'ai-tooling', kind: 'org' },
  { owner: 'livekit', repo: 'agent-skills', kind: 'org' },
  { owner: 'makenotion', repo: 'claude-code-notion-plugin', kind: 'org' },
  { owner: 'mapbox', repo: 'mapbox-agent-skills', kind: 'org' },
  { owner: 'mastra-ai', repo: 'skills', kind: 'org' },
  { owner: 'mcp-use', repo: 'mcp-use', kind: 'org' },
  { owner: 'medusajs', repo: 'medusa-agent-skills', kind: 'org' },
  { owner: 'microsoft', repo: 'github-copilot-for-azure', kind: 'org' },
  { owner: 'microsoft', repo: 'playwright-cli', kind: 'org' },
  { owner: 'n8n-io', repo: 'n8n', kind: 'org' },
  { owner: 'neondatabase', repo: 'agent-skills', kind: 'org' },
  { owner: 'nuxt', repo: 'ui', kind: 'org' },
  { owner: 'openai', repo: 'skills', kind: 'org' },
  { owner: 'openshift', repo: 'hypershift', kind: 'org' },
  { owner: 'planetscale', repo: 'database-skills', kind: 'org' },
  { owner: 'posthog', repo: 'posthog', kind: 'org' },
  { owner: 'prisma', repo: 'skills', kind: 'org' },
  { owner: 'pulumi', repo: 'agent-skills', kind: 'org' },
  { owner: 'pytorch', repo: 'pytorch', kind: 'org' },
  { owner: 'redis', repo: 'agent-skills', kind: 'org' },
  { owner: 'remotion-dev', repo: 'skills', kind: 'org' },
  { owner: 'resend', repo: 'resend-skills', kind: 'org' },
  { owner: 'rivet-dev', repo: 'skills', kind: 'org' },
  { owner: 'runwayml', repo: 'skills', kind: 'org' },
  { owner: 'sanity-io', repo: 'agent-toolkit', kind: 'org' },
  { owner: 'semgrep', repo: 'skills', kind: 'org' },
  { owner: 'streamlit', repo: 'agent-skills', kind: 'org' },
  { owner: 'stripe', repo: 'ai', kind: 'org' },
  { owner: 'supabase', repo: 'agent-skills', kind: 'org' },
  // Old name. ADR-0015 moves its rows to the entry below.
  { owner: 'sveltejs', repo: 'mcp', kind: 'org' },
  { owner: 'sveltejs', repo: 'ai-tools', kind: 'org' },
  { owner: 'vuejs-ai', repo: 'skills', kind: 'org' },
  { owner: 'vueuse', repo: 'skills', kind: 'org' },
  { owner: 'tavily-ai', repo: 'skills', kind: 'org' },
  { owner: 'tinybirdco', repo: 'tinybird-agent-skills', kind: 'org' },
  { owner: 'tldraw', repo: 'tldraw', kind: 'org' },
  { owner: 'triggerdotdev', repo: 'skills', kind: 'org' },
  { owner: 'upstash', repo: 'context7', kind: 'org' },
  { owner: 'vercel', repo: 'ai', kind: 'org' },
  { owner: 'vercel', repo: 'next.js', kind: 'org' },
  { owner: 'vercel-labs', repo: 'agent-skills', kind: 'org' },
  // Old name. ADR-0015 moves its rows to the entry below.
  { owner: 'vercel-labs', repo: 'vercel-plugin', kind: 'org' },
  { owner: 'vercel', repo: 'vercel-plugin', kind: 'org' },
  { owner: 'vercel-labs', repo: 'agent-browser', kind: 'org' },
  { owner: 'webflow', repo: 'webflow-skills', kind: 'org' },
  { owner: 'wix', repo: 'skills', kind: 'org' },
  { owner: 'wordpress', repo: 'agent-skills', kind: 'org' },

  // Individual developers publishing their own skill repos.
  { owner: 'garrytan', repo: 'gstack', kind: 'user' },
  { owner: 'obra', repo: 'superpowers', kind: 'user' },
  { owner: 'antfu', repo: 'skills', kind: 'user' },
  { owner: 'jimliu', repo: 'baoyu-skills', kind: 'user' },
  { owner: 'pbakaus', repo: 'agent-reviews', kind: 'user' },
  { owner: 'pbakaus', repo: 'impeccable', kind: 'user' },
  { owner: 'kepano', repo: 'obsidian-skills', kind: 'user' },
  { owner: 'addyosmani', repo: 'web-quality-skills', kind: 'user' },
  { owner: 'mattpocock', repo: 'skills', kind: 'user' },
  { owner: 'ibelick', repo: 'ui-skills', kind: 'user' },
  // Old name. ADR-0015 moves its rows to the entry below.
  { owner: 'brianlovin', repo: 'claude-config', kind: 'user' },
  { owner: 'brianlovin', repo: 'agent-config', kind: 'user' },
  { owner: 'dimillian', repo: 'skills', kind: 'user' },
  { owner: 'onmax', repo: 'nuxt-skills', kind: 'user' },
  // Old name. ADR-0015 merges its rows into vuejs-ai/skills above.
  { owner: 'hyf0', repo: 'vue-skills', kind: 'user' },
  { owner: 'emilkowalski', repo: 'skills', kind: 'user' },
  { owner: 'nutlope', repo: 'hallmark', kind: 'user' },
]
