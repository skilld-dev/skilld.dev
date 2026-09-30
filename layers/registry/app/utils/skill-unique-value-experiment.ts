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
 * Every Skill below sat in the production skills sitemap and was indexable on
 * 2026-09-30 (checked against `/api/skills`, not against an HTTP status).
 * Only 7 trending Skills met that bar and render on the Skill page, so three
 * treatment Skills come from the sitemap at other star counts. Each control
 * Skill has the nearest star count among the remaining repositories. That
 * leaves the trending signal uneven between the groups; read the result
 * with that in mind.
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
    'emilkowalski/skills/emil-design-eng',
    'vercel-labs/agent-skills/react-best-practices',
    'microsoft/playwright-cli/playwright-cli',
    'getsentry/skills/prompt-optimizer',
    'neondatabase/agent-skills/neon-postgres',
    'clerk/skills/clerk-orgs',
    'prisma/skills/prisma-database-setup',
    'remotion-dev/skills/remotion-best-practices',
    'makenotion/claude-code-notion-plugin/knowledge-capture',
    'resend/resend-skills/agent-email-inbox',
  ],
  /** Control: matched to the treatment Skill on the same line by repository stars. */
  control: [
    'vercel-labs/agent-browser/agent-browser',
    'openai/skills/aspnet-core',
    'huggingface/skills/hf-cli',
    'kotlin/kotlin-agent-skills/kotlin-backend-jpa-entity-mapping',
    'wdm0006/python-skills/verifying-external-behavior',
    'mapbox/mapbox-agent-skills/mapbox-android-patterns',
    'get-convex/agent-skills/convex-quickstart',
    'google-gemini/gemini-skills/gemini-api-dev',
    'tavily-ai/skills/tavily-best-practices',
    'sanity-io/agent-toolkit/content-experimentation-best-practices',
  ],
} as const

const TREATMENT = new Set<string>(UNIQUE_VALUE_EXPERIMENT.treatment.map(slug => slug.toLowerCase()))

/** True when the Skill page `owner/repo/name` gets the experiment template. */
export function isUniqueValueTreatment(slug: string): boolean {
  return TREATMENT.has(slug.toLowerCase())
}
