/**
 * How a demo names its recording in short form: the Agent's logo and a
 * readable model name. The full sentence stays available to screen readers.
 */

const AGENT_ICONS: Readonly<Record<string, string>> = {
  'Claude Code': 'i-simple-icons-claude',
  'Codex': 'i-simple-icons-openai',
}

export const DEMO_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'] as const
export type DemoEffort = typeof DEMO_EFFORTS[number]

/** Older recordings carry no effort evidence. */
export function demoRecordingLabel(model: string, effort: DemoEffort | null): string {
  return `${demoModelLabel(model)}${effort ? `, ${effort} effort` : ''}`
}

/** The Agent's logo, or a generic one for an Agent this table does not know. */
export function demoAgentIcon(agent: string): string {
  return AGENT_ICONS[agent] ?? 'i-lucide-bot'
}

/** `claude-opus-5-5` reads as `Opus 5.5`. Any other id prints as recorded. */
export function demoModelLabel(model: string): string {
  // A minor version is one or two digits; a dated id ends in eight.
  const match = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(model)
  if (!match)
    return model
  const [, family = '', major, minor] = match
  return `${family.charAt(0).toUpperCase()}${family.slice(1)} ${minor ? `${major}.${minor}` : major}`
}
