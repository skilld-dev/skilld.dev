import { AGENT_SETUP_PATH, agentSetupMarkdown } from '#shared/agent-setup'

// Setup steps for an Agent, linked from the homepage prompt. A middleware, not
// a route: nuxt-ai-ready answers every explicit `.md` path from its own
// middleware, and a project middleware runs before it. The file is for
// Agents, not search, so it answers noindex and stays out of the sitemap.
export default defineEventHandler((event) => {
  if (event.path !== AGENT_SETUP_PATH)
    return
  setHeader(event, 'Content-Type', 'text/markdown; charset=utf-8')
  setHeader(event, 'X-Robots-Tag', 'noindex')
  setHeader(event, 'Cache-Control', 'public, max-age=3600, s-maxage=86400')
  return agentSetupMarkdown()
})
