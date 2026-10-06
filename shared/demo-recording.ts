/**
 * How a demo names its recording in short form: the Agent's logo and a
 * readable model name. The full sentence stays available to screen readers.
 */

const AGENT_ICONS: Readonly<Record<string, string>> = {
  'Claude Code': 'i-simple-icons-claude',
}

/** The Agent's logo, or a generic one for an Agent this table does not know. */
export function demoAgentIcon(agent: string): string {
  return AGENT_ICONS[agent] ?? 'i-lucide-bot'
}

/** `claude-opus-5-5` reads as `Opus 5.5`. Any other id prints as recorded. */
export function demoModelLabel(model: string): string {
  const match = /^claude-([a-z]+)-(\d+)-(\d+)/.exec(model)
  if (!match)
    return model
  const [, family, major, minor] = match as unknown as [string, string, string, string]
  return `${family.charAt(0).toUpperCase()}${family.slice(1)} ${major}.${minor}`
}
