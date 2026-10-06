/**
 * The header's Developers menu. Desktop shows each item as a card; the mobile
 * menu lists the same items. COPY.md owns every string here.
 */
export interface DeveloperMenuItem {
  label: string
  description: string
  /** The card's call to action. */
  action: string
  icon: string
  to: string
  /** The card's `.editorial-atmosphere` palette. Rose marks the recommended path. */
  palette: 'rose' | 'ember' | 'stone'
  /** `connect` cards share the top row; `author` cards share the row below. */
  group: 'connect' | 'author'
}

export const developerMenuItems: DeveloperMenuItem[] = [
  {
    label: 'CLI',
    description: 'Search, run, install, and keep Skills current.',
    action: 'Install the CLI',
    icon: 'i-lucide-square-terminal',
    to: '/cli',
    palette: 'rose',
    group: 'connect',
  },
  {
    label: 'MCP server',
    description: 'For ChatGPT, Claude, and any app that speaks MCP.',
    action: 'Add the MCP server',
    icon: 'i-lucide-plug',
    to: '/developers?setup=mcp',
    palette: 'ember',
    group: 'connect',
  },
  {
    label: 'SDK',
    description: 'For your own code, with the TypeScript SDK or plain HTTP.',
    action: 'Call the skilld API',
    icon: 'i-lucide-braces',
    to: '/developers?setup=api',
    palette: 'stone',
    group: 'connect',
  },
  {
    label: 'Make a skill',
    // generate-package-skill, generate-project-skill and review-skill.
    description: 'Guides and three authoring Skills to write and review your own.',
    action: 'Get the steps',
    icon: 'i-lucide-pen-line',
    to: '/make-skill',
    palette: 'stone',
    group: 'author',
  },
  {
    label: 'Skillgen',
    description: 'Keeps your package skill current with a draft pull request after each release.',
    action: 'Set up Skillgen',
    icon: 'i-lucide-git-pull-request-draft',
    to: '/skillgen',
    palette: 'ember',
    group: 'author',
  },
]
