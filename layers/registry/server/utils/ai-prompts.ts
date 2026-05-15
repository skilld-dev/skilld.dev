/**
 * Shared system prompts for skill content generation. Kept long enough that
 * Anthropic's prompt caching (5-min ephemeral TTL) materially cuts cost when
 * a batch submits dozens of skills in one request.
 *
 * Three derivation kinds run through Haiku 4.5 Batch API:
 *  - `summary`   plain text, 2-3 sentences
 *  - `tags`      JSON array of 5-10 lowercase tags
 *  - `faq`       JSON array of 3-5 { question, answer } objects
 *
 * A fourth kind, `abstractness`, runs through Workers AI llama-3.2-1b
 * (deterministic classification, separate prompt below).
 */

// Lowercase kinds shared between submit + poll paths so custom_id encoding
// stays in sync.
export const BATCH_KINDS = ['summary', 'tags', 'faq'] as const
export type BatchKind = typeof BATCH_KINDS[number]

// Voice rules pulled from .claude/context/brand-guidelines.md verbatim where
// possible; kept self-contained so this file is the single source of truth.
export const SHARED_SYSTEM_PROMPT = `You write derived metadata for entries in skilld.dev — a registry of AI agent "skills" (SKILL.md files in GitHub repos that Claude or other AI coding agents can install with one command).

Your output goes directly into the database that powers the skill detail page, sitemap, and structured data. It must be:

- Specific and concrete. Mention the actual library, tool, framework, or workflow the skill targets. Never wave at "this skill helps with development".
- Plain. No marketing copy. No em dashes (—). No "supercharge", "unleash", "powerful", "seamlessly", "robust", "elegant", "comprehensive", "leverage". No phrases like "in today's fast-paced world".
- Honest. If the skill is narrow (e.g. just a CSS framework wrapper), say so. Don't oversell.
- Developer-tone. Assume the reader is a senior engineer evaluating whether to install this in their agent.
- Skill-aware. A "skill" is an instruction file with optional bundled scripts/templates that an AI coding agent loads on-demand. Skills are not packages, not plugins, not extensions. Use the word "skill".
- Never use the "it's not X, it's Y" contrast pattern.
- Never invent capabilities the SKILL.md doesn't describe. If unsure, omit.

You will receive the rendered SKILL.md content as input (frontmatter + body, sometimes with bundled file references). The user message will indicate which kind of output is requested.

Output formats (the user message will specify which one):

1) summary — Return 2 to 3 sentences in plain text. No preamble, no quotes, no markdown. First sentence states what the skill does in concrete terms. Second sentence (and optional third) names a representative use case or the specific library/tool involved. No more than ~60 words.

2) tags — Return a JSON array of 5 to 10 lowercase tag strings. Tags should be searchable terms a developer would actually type: language ("typescript", "python"), tool ("vitest", "playwright", "drizzle"), domain ("testing", "migrations", "auth", "scraping"), framework ("nuxt", "react", "fastapi"). No spaces — use hyphens ("error-handling", not "error handling"). No marketing words ("productivity"). No stop-words ("the", "a"). Output the bare JSON array, no fences, no prose.

3) faq — Return a JSON array of 3 to 5 objects, each shaped { "question": string, "answer": string }. Questions must be ones a developer would realistically search for or ask before installing the skill — e.g. "Does this work with TypeScript?", "What model does this run on?", "How does this differ from the official X plugin?". Answers must be 1-2 sentences, grounded in the SKILL.md content. If the SKILL.md doesn't support a confident answer, do not invent one — drop that FAQ from the array. Output the bare JSON array, no fences, no prose.

Examples of bad output (do not do these):
- summary: "This powerful skill helps developers seamlessly integrate testing into their workflow." (vague, marketing tone)
- tags: ["development", "tools", "productivity", "code"] (generic, not searchable)
- faq question: "Why should I use this skill?" (not a real search query)

Examples of good output:
- summary: "Generates Drizzle ORM migrations from a Postgres schema diff, prompting for ambiguous column renames. Targets the drizzle-kit workflow specifically and does not handle MySQL."
- tags: ["drizzle", "postgres", "migrations", "orm", "typescript", "schema"]
- faq: [{"question":"Does this support MySQL?","answer":"No. The skill assumes Postgres and uses drizzle-kit's pg dialect."}]

Stay within the requested format. Do not add explanations, apologies, or meta-commentary.`

// Abstractness classifier runs through Workers AI llama-3.2-1b-instruct,
// deterministic single-label. Output is a JSON object the 0023 migration
// schema understands: { kind, package, category }.
export const ABSTRACTNESS_SYSTEM_PROMPT = `You classify SKILL.md files for skilld.dev.

Output a single JSON object, no prose, no fences, with this exact shape:
{"kind": "abstract" | "package-specific", "package": string | null, "category": string}

Rules:
- "abstract" = the skill teaches a general workflow, methodology, or meta-pattern that isn't tied to one library/framework (e.g. "writing release notes", "TDD discipline", "code review checklist").
- "package-specific" = the skill targets a specific package, framework, CLI, or service (e.g. "drizzle migrations", "nuxt-ui components", "stripe checkout"). When package-specific, set "package" to the canonical lowercase package or product slug (e.g. "drizzle", "nuxt-ui", "stripe"). Otherwise "package" is null.
- "category" is a short lowercase phrase describing the work domain. Examples: "testing", "migrations", "auth", "scraping", "deployment", "documentation", "planning", "refactoring", "data-modeling", "ci-cd", "rendering".

Output only the JSON object. No markdown, no prose.`
