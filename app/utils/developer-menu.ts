/**
 * The header's Developers menu. Desktop shows the three ways to connect as
 * compact rows beside one Make a skill card; the mobile menu lists all four.
 * COPY.md owns every string here.
 */
export interface DeveloperMenuItem {
  label: string
  description: string
  icon: string
  to: string
}

export const developerConnectItems: DeveloperMenuItem[] = [
  {
    label: 'CLI',
    description: 'Search, run, install, and keep Skills current.',
    icon: 'i-lucide-square-terminal',
    to: '/cli',
  },
  {
    label: 'MCP server',
    description: 'For ChatGPT, Claude, and any app that speaks MCP.',
    icon: 'i-lucide-plug',
    to: '/developers?setup=mcp',
  },
  {
    label: 'SDK',
    description: 'For your own code, with the TypeScript SDK or plain HTTP.',
    icon: 'i-lucide-braces',
    to: '/developers?setup=api',
  },
]

/** `/make-skill` routes each maintainer to the guides or to Skillgen, so the menu links it once. */
export const makeSkillMenuItem = {
  label: 'Make a skill',
  description: 'Write a Skill for your package or project, then keep it current.',
  action: 'Get the steps',
  icon: 'i-lucide-pen-line',
  to: '/make-skill',
  routes: [
    // generate-package-skill, generate-project-skill and review-skill.
    { icon: 'i-lucide-book-open', label: 'Guides and three authoring Skills' },
    { icon: 'i-lucide-git-pull-request-draft', label: 'Skillgen drafts updates after each release' },
  ],
} as const

export const developerMenuItems: DeveloperMenuItem[] = [...developerConnectItems, makeSkillMenuItem]
