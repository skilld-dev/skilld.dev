/**
 * What skilld does differently from skills.sh, in one place, so the homepage
 * band and `/vs/skills-sh` say the same thing in the same words.
 *
 * Every skills.sh line is a fact we checked on SKILLS_SH_CHECKED_ON, with its
 * source in `sources`. A line without a source is a claim we cannot defend, so
 * it does not ship. Re-check them before changing a line: skills.sh added
 * `skills use` in May 2026, which retired the old "install only" line.
 */

export type WhyReasonId = 'human' | 'previews' | 'independent' | 'run' | 'behaviors' | 'cost' | 'telemetry'

export interface WhyReason {
  id: WhyReasonId
  /** A lucide icon for the reason's row. Monochrome, like every icon in UI chrome. */
  icon: string
  title: string
  /** One short line, for the homepage columns. */
  summary: string
  /** What skilld does, in full, for `/vs/skills-sh`. */
  line: string
  /**
   * What skills.sh does, as its own pages and source say. Every surface
   * prints it after a "skills.sh" label, so it never names skills.sh again.
   */
  skillsSh: string
  link: { label: string, to: string, external?: boolean } | null
  /** Where the skills.sh line comes from. */
  sources: readonly string[]
}

export const SKILLS_SH_CHECKED_ON = '7 Oct 2026'

/** The file that ranks every trending board. The Independent reason calls it open, so it links it. */
export const TRENDING_SCORE_SOURCE_URL = 'https://github.com/skilld-dev/skilld.dev/blob/main/shared/trending-skill-score.ts'

/**
 * Each title names what a dev gets, and each line says how. The behaviors line
 * holds only what the released CLI does: a remote `skilld run` stops before a
 * behavior that needs approval and changes nothing until the user allows it.
 */
export const WHY_REASONS: Readonly<Record<WhyReasonId, WhyReason>> = {
  human: {
    id: 'human',
    icon: 'i-lucide-users-round',
    title: 'Human first',
    summary: 'The maintainers who write Skills, and the devs who talk about them.',
    line: 'Every Skill names the maintainer who wrote it. Trending shows the devs who posted about it, in their own words.',
    skillsSh: 'Shows the owner and the repository. Its leaderboard counts installs.',
    link: { label: 'Trending skills', to: '/skills/trending' },
    sources: ['https://skills.sh', 'https://skills.sh/docs/faq'],
  },
  previews: {
    id: 'previews',
    icon: 'i-lucide-eye',
    title: 'Preview the output',
    summary: 'Compare what Skills make before you spend tokens on a run.',
    line: 'Each demo is one recorded run: the prompt, and what the Agent built with the Skill. Compare Skills by their output before you spend tokens on a run.',
    skillsSh: 'Shows the SKILL.md and install counts, with no output from a run.',
    link: { label: 'All demos', to: '/skills/demos' },
    sources: ['https://skills.sh'],
  },
  independent: {
    id: 'independent',
    icon: 'i-lucide-scale',
    title: 'Independent',
    summary: 'No paid placement, and the trending weights are open.',
    line: 'Harlan Wilton builds skilld, and no listing is for sale. The trending weights are open, so you can read the code that ranks every board.',
    skillsSh: 'Vercel operates it. Its leaderboard ranks by installs that its own CLI reports.',
    link: { label: 'Read the ranking code', to: TRENDING_SCORE_SOURCE_URL, external: true },
    sources: ['https://skills.sh/about', 'https://skills.sh/docs/faq'],
  },
  run: {
    id: 'run',
    icon: 'i-lucide-feather',
    title: 'No more skill bloat',
    summary: 'Run a Skill once off. Nothing lands on disk.',
    line: 'Run a Skill once off. Your agent reads it for one session, and skilld writes no file, no lockfile entry, and no cache.',
    skillsSh: '`skills add` installs the files into your project. `skills use` writes them to a temporary directory.',
    link: { label: 'How run works', to: '/cli#run' },
    sources: ['https://github.com/vercel-labs/skills#readme'],
  },
  behaviors: {
    id: 'behaviors',
    icon: 'i-lucide-square-terminal',
    title: 'Know what it runs',
    summary: 'See what a Skill asks your agent to do before it runs.',
    line: 'Skill behaviors flag shell commands, scripts, and network calls, with a link to each line. `skilld run` waits for your approval before remote code or credential reads.',
    skillsSh: 'Shows partner audit verdicts from Gen Agent Trust Hub, Socket, and Snyk. skilld shows the same verdicts on each Skill page.',
    link: { label: 'Open the pdf Skill', to: '/gh/anthropics/skills/pdf' },
    sources: ['https://skills.sh/audits'],
  },
  cost: {
    id: 'cost',
    icon: 'i-lucide-gauge',
    title: 'Know what it costs',
    summary: 'See what a Skill costs in tokens before it loads.',
    line: 'A Skill page shows what each part costs in tokens: always, when used, and on demand. You see it before your agent loads anything.',
    skillsSh: 'Shows the SKILL.md with no token cost. The full file tree needs its API and a Vercel token.',
    link: { label: 'Open the pdf Skill', to: '/gh/anthropics/skills/pdf' },
    sources: ['https://skills.sh/docs/api'],
  },
  telemetry: {
    id: 'telemetry',
    icon: 'i-lucide-eye-off',
    title: 'No telemetry',
    summary: 'The CLI is open source and sends no telemetry.',
    line: 'The skilld CLI is open source under MIT. It sends no telemetry or analytics.',
    skillsSh: 'The skills CLI is MIT too. Its telemetry is on by default and sends Skill names and search queries. `DISABLE_TELEMETRY=1` turns it off.',
    link: { label: 'Read the source', to: 'https://github.com/skilld-dev/skilld', external: true },
    sources: ['https://github.com/vercel-labs/skills/blob/main/src/telemetry.ts', 'https://skills.sh/docs/cli'],
  },
}

/**
 * The homepage leads with the three reasons Harlan chose on 2026-10-07: the
 * people behind Skills, output you can compare, and a ranking nobody owns.
 */
export const HOME_WHY_REASONS: readonly WhyReasonId[] = ['human', 'previews', 'independent']

/** `/vs/skills-sh` shows every reason, the homepage three first. */
export const VS_WHY_REASONS: readonly WhyReasonId[] = ['human', 'previews', 'independent', 'run', 'behaviors', 'cost', 'telemetry']

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
    { label: 'Files on the Skill page', skillsSh: 'SKILL.md', skilld: 'Every file, with its token cost' },
    { label: 'Before a run', skillsSh: 'Partner audit verdicts', skilld: 'The same audit verdicts, plus Skill behaviors and an approval stop' },
    { label: 'What ranks a Skill', skillsSh: 'Install counts from CLI telemetry', skilld: 'Devs who posted about it, with open weights' },
    { label: 'Who wrote it', skillsSh: 'Owner and repository', skilld: 'The maintainer, and the exact SKILL.md' },
    { label: 'Output before you run', skillsSh: 'None', skilld: 'Recorded demos' },
    { label: 'CLI telemetry', skillsSh: 'On by default, opt out', skilld: 'None' },
    { label: 'CLI licence', skillsSh: 'MIT', skilld: 'MIT' },
    { label: 'Agents', skillsSh: '79', skilld: `${agentTargetCount}, plus MCP apps` },
    { label: 'Staying current', skillsSh: '`skills update`', skilld: 'Watch for changes, monthly digest' },
    { label: 'Run by', skillsSh: 'Vercel', skilld: 'Harlan Wilton, independent' },
  ]
}
