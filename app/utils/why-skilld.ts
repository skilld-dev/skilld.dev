/**
 * What skilld does differently from skills.sh, in one place, so the homepage
 * band and `/vs/skills-sh` say the same thing in the same words.
 *
 * Every skills.sh line is a fact we checked on SKILLS_SH_CHECKED_ON, with its
 * source in `sources`. A line without a source is a claim we cannot defend, so
 * it does not ship. Re-check them before changing a line: skills.sh added
 * `skills use` in May 2026, which retired the old "install only" line.
 */

export type WhyReasonId = 'run' | 'files' | 'devs' | 'author' | 'demos' | 'telemetry' | 'independent'

export interface WhyReason {
  id: WhyReasonId
  title: string
  /** What skilld does. */
  line: string
  /** What skills.sh does, as its own pages and source say. */
  skillsSh: string
  link: { label: string, to: string, external?: boolean } | null
  /** Where the skills.sh line comes from. */
  sources: readonly string[]
}

export const SKILLS_SH_CHECKED_ON = '7 Oct 2026'

export const WHY_REASONS: Readonly<Record<WhyReasonId, WhyReason>> = {
  run: {
    id: 'run',
    title: 'Run a Skill once off',
    line: 'Your agent reads the Skill for one session. skilld writes no file, no lockfile entry, and no cache. Install only the Skills you keep.',
    skillsSh: '`skills add` installs the files into your project. `skills use` writes them to a temporary directory.',
    link: { label: 'How run works', to: '/cli#run' },
    sources: ['https://github.com/vercel-labs/skills#readme'],
  },
  files: {
    id: 'files',
    title: 'Read every file first',
    line: 'A Skill page lists every file with its token cost. Skill behaviors show what the files ask your agent to do, with links to the lines.',
    skillsSh: 'A skills.sh page shows the SKILL.md. The full file tree needs its API and a Vercel token.',
    link: { label: 'Open the pdf Skill', to: '/gh/anthropics/skills/pdf' },
    sources: ['https://skills.sh/docs/api'],
  },
  devs: {
    id: 'devs',
    title: 'Ranked by devs, never installs',
    line: 'Trending counts the separate devs who posted about a Skill on X and Bluesky. Every post is one click away.',
    skillsSh: 'skills.sh ranks by install counts from the telemetry in its CLI.',
    link: { label: 'Trending skills', to: '/skills/trending' },
    sources: ['https://skills.sh/docs/faq'],
  },
  author: {
    id: 'author',
    title: 'See who wrote it',
    line: 'Every Skill names the person who wrote it and links the exact SKILL.md in their repository.',
    skillsSh: 'skills.sh shows the owner and the repository, with a badge for verified organizations.',
    link: null,
    sources: ['https://skills.sh'],
  },
  demos: {
    id: 'demos',
    title: 'Preview what a Skill makes',
    line: 'A demo is one recorded run: the prompt, and what the agent built with the Skill.',
    skillsSh: 'skills.sh pages show the SKILL.md and install counts. They show no output from a run.',
    link: { label: 'All demos', to: '/skills/demos' },
    sources: ['https://skills.sh'],
  },
  telemetry: {
    id: 'telemetry',
    title: 'No telemetry',
    line: 'The skilld CLI is open source under MIT. It sends no telemetry or analytics.',
    skillsSh: 'The skills CLI is MIT too. Its telemetry is on by default and sends Skill names and search queries. `DISABLE_TELEMETRY=1` turns it off.',
    link: { label: 'Read the source', to: 'https://github.com/skilld-dev/skilld', external: true },
    sources: ['https://github.com/vercel-labs/skills/blob/main/src/telemetry.ts', 'https://skills.sh/docs/cli'],
  },
  independent: {
    id: 'independent',
    title: 'Independent',
    line: 'Harlan Wilton builds skilld. It has no sponsored listings, no paid placement, and no paywalls.',
    skillsSh: 'Vercel operates skills.sh.',
    link: { label: 'Harlan on GitHub', to: 'https://github.com/harlan-zw', external: true },
    sources: ['https://skills.sh/about'],
  },
}

/** The homepage shows four in full. The trust line under them carries the rest. */
export const HOME_WHY_REASONS: readonly WhyReasonId[] = ['run', 'files', 'devs', 'author']

/** `/vs/skills-sh` shows every reason, in this order. */
export const VS_WHY_REASONS: readonly WhyReasonId[] = ['run', 'files', 'devs', 'author', 'demos', 'telemetry', 'independent']

/** Where skills.sh is ahead. A comparison that admits none reads as an ad. */
export interface SkillsShLead {
  title: string
  line: string
  sources: readonly string[]
}

export function skillsShLeads(agentTargetCount: number): SkillsShLead[] {
  return [
    {
      title: 'More Skills',
      line: 'skills.sh lists every public Skill its CLI has seen. skilld lists curated Skills only, so a search there finds more.',
      sources: ['https://skills.sh/about'],
    },
    {
      title: 'More agents',
      line: `The skills CLI installs into 79 agents. The skilld CLI installs into ${agentTargetCount}, and MCP apps such as ChatGPT search skilld from the chat.`,
      sources: ['https://github.com/vercel-labs/skills#readme'],
    },
    {
      title: 'Partner audits',
      line: 'skills.sh shows audit results from Gen Agent Trust Hub, Socket, and Snyk. skilld shows Skill behaviors with links to the lines, and claims no Skill is safe.',
      sources: ['https://skills.sh/audits'],
    },
  ]
}

export interface ComparisonRow {
  label: string
  skillsSh: string
  skilld: string
}

export function comparisonRows(agentTargetCount: number): ComparisonRow[] {
  return [
    { label: 'Use without installing', skillsSh: '`skills use` writes the files to a temporary directory', skilld: '`skilld run` writes nothing' },
    { label: 'Files on the Skill page', skillsSh: 'SKILL.md', skilld: 'Every file, with token cost and Skill behaviors' },
    { label: 'What ranks a Skill', skillsSh: 'Install counts from CLI telemetry', skilld: 'Devs who posted about it, then GitHub stars' },
    { label: 'Who wrote it', skillsSh: 'Owner and repository', skilld: 'Name, avatar, and the exact SKILL.md' },
    { label: 'Output before you run', skillsSh: 'None', skilld: 'Recorded demos' },
    { label: 'CLI telemetry', skillsSh: 'On by default, opt out', skilld: 'None' },
    { label: 'CLI licence', skillsSh: 'MIT', skilld: 'MIT' },
    { label: 'Agents', skillsSh: '79', skilld: `${agentTargetCount}, plus MCP apps` },
    { label: 'Security reports', skillsSh: 'Partner audits', skilld: 'Skill behaviors, linked to the lines' },
    { label: 'Staying current', skillsSh: '`skills update`', skilld: 'Watch for changes, monthly digest' },
    { label: 'Run by', skillsSh: 'Vercel', skilld: 'Harlan Wilton, independent' },
  ]
}
