import { AGENT_LOGOS } from './agent-logos'
import { AGENT_TARGETS } from './agents'

/**
 * Where skilld reaches an Agent, for the homepage. The CLI Agents link their
 * `/agents/<id>` page. Claude and ChatGPT have no terminal, so they link the
 * MCP setup steps; the Skill page also gives them a ZIP to upload.
 */
export interface AgentReach {
  id: string
  label: string
  icon: string
  to: string
  /** How skilld reaches it. */
  via: 'CLI' | 'MCP'
}

export const AGENT_REACH: readonly AgentReach[] = [
  ...AGENT_LOGOS.map(agent => ({ ...agent, to: `/agents/${agent.id}`, via: 'CLI' as const })),
  { id: 'claude', label: 'Claude', icon: 'i-simple-icons-claude', to: '/developers?setup=mcp&app=claude', via: 'MCP' },
  { id: 'chatgpt', label: 'ChatGPT', icon: 'i-simple-icons-openai', to: '/developers?setup=mcp&app=chatgpt', via: 'MCP' },
]

/** The CLI targets without a logo here. `/cli#install` lists every one. */
export const MORE_AGENT_COUNT = AGENT_TARGETS.length - AGENT_LOGOS.length
