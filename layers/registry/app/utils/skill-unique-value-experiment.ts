/**
 * SEO experiment C, "unique value": the gate and the two groups. Delete this
 * file after the decision. Nothing else decides which Skill page is treated.
 *
 * Started 2026-09-30. Read the result at the Search Console gate on 2026-11-11.
 * Google holds the curated Skill URLs as "Discovered, currently not indexed",
 * and about 72% of a Skill page's text is the GitHub SKILL.md word for word.
 * The question: do pages that carry data GitHub lacks get crawled and indexed
 * sooner than pages that stay as they are?
 *
 * Treatment pages show the run or install command, the file inventory, the
 * repository star trend, related Skills, and a SKILL.md excerpt in place of the
 * full body. Every visitor sees the same page, crawler or not. Control pages
 * stay unchanged.
 *
 * Every Skill below sits on a trending list (week, month, or all-time), in the
 * production skills sitemap, and was indexable on 2026-09-30. A parallel
 * experiment keeps only trending Skills indexable, so a control outside those
 * lists would leave the index. Membership came from `/api/feed/trending`,
 * `/api/skills/leaderboard`, and the sitemap, checked against `/api/skills`,
 * not against an HTTP status. Only Skills whose canonical page is the
 * three-segment `SkillDetail` route qualify; single-Skill repositories render
 * on the repository hub. Twenty-two Skills qualified. Two were dropped and the
 * rest were paired by repository stars. Within each pair, the treatment Skill
 * alternates between the higher and the lower star count.
 *
 * Cull path: after the decision, delete this file, `skill-unique-value.ts`,
 * `_SkillUniqueValue.vue`, and the `isUniqueValueTreatment` branches in
 * `SkillDetail.vue`. If the treatment wins, roll the template out by
 * removing the gate; if not, remove the template.
 */
export const UNIQUE_VALUE_EXPERIMENT = {
  startedOn: '2026-09-30',
  endsOn: '2026-11-11',
  /** Treatment: `owner/repo/name`. */
  treatment: [
    'obra/superpowers/writing-plans',
    'imbad0202/academic-research-skills/academic-pipeline',
    'emilkowalski/skills/emil-design-eng',
    'vercel-labs/agent-skills/react-best-practices',
    'ibelick/ui-skills/create-design-md',
    'remotion-dev/skills/remotion-best-practices',
    'dimillian/skills/bug-hunt-swarm',
    'onmax/nuxt-skills/arkenv',
    'neondatabase/agent-skills/neon-postgres',
    'clerk/skills/clerk-orgs',
  ],
  /** Control: the star-matched partner of the treatment Skill at the same index. */
  control: [
    'mattpocock/skills/ask-matt',
    'coreyhaines31/marketingskills/ai-seo',
    'kepano/obsidian-skills/knap',
    'othmanadi/planning-with-files/planning-with-files',
    'microsoft/playwright-cli/playwright-cli',
    'antfu/skills/nitro',
    'addyosmani/web-quality-skills/accessibility',
    'getsentry/skills/prompt-optimizer',
    'pbakaus/agent-reviews/resolve-agent-reviews',
    'prisma/skills/prisma-database-setup',
  ],
} as const

const TREATMENT = new Set<string>(UNIQUE_VALUE_EXPERIMENT.treatment.map(slug => slug.toLowerCase()))

/** True when the Skill page `owner/repo/name` gets the experiment template. */
export function isUniqueValueTreatment(slug: string): boolean {
  return TREATMENT.has(slug.toLowerCase())
}
