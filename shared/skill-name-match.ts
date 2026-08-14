/**
 * Find which of a repository's OWN skills a post is talking about.
 *
 * The inverse of `skill-mentions.ts`, and measurably better. That module reads
 * a post cold and guesses what might be a skill name, then pays GitHub to find
 * out. This one starts from the repo the post linked, takes the skills it
 * actually ships, and looks for those names in the text. The vocabulary is
 * closed and already verified, so a match needs no verification call at all.
 *
 * WHY IT EXISTS. Measured over 396 Bluesky posts from a 30-day window in
 * August 2026, open-vocabulary extraction produced 17 candidates and zero
 * verified skills. The same corpus through this matcher produced 37 mentions
 * of 32 distinct skills, across 30 posts, with no hand-written blocklist.
 *
 * The reason is structural rather than platform-specific. Extraction leans on
 * conventions people only use in long-form: a `/slash` name, a fenced install
 * command, "a skill called X". Most posts do none of that. They link a repo
 * and say the skill's name in an ordinary sentence, and a name only looks like
 * a name once you already know it is one.
 *
 * Pure and dependency-free: text and a vocabulary in, matches out. Every rule
 * below came from reading the posts it got wrong.
 */

/**
 * How the name appeared, strongest first. Callers can require a minimum, and
 * the ledger keeps it as provenance when a match later looks wrong.
 */
export type SkillNameEvidence = 'slash' | 'quoted' | 'prose'

export interface SkillNameMatch {
  /** The vocabulary entry that matched, exactly as supplied. */
  name: string
  evidence: SkillNameEvidence
  /** Surrounding text, so a reviewer can judge the match without the post. */
  quote: string
}

export interface KnownSkill {
  /** Directory-derived slug: the routing identity. */
  slug: string
  /** Frontmatter `name:`, when it differs from the slug. */
  canonicalName?: string | null
}

/**
 * Names too ordinary to be evidence on their own.
 *
 * A repo shipping a skill called `research` must not claim every post that
 * contains the word. These are not false-positive patches: each one is a real
 * skill name in a real indexed repo, which is exactly why the guard is needed.
 *
 * An earlier version demoted rather than excluded these, accepting them when
 * the word "skill" appeared nearby. That tier produced only false positives:
 * "write like a human" matched a skill named `human`, and "also comes with a
 * Claude skill" matched one named `skill`. It was removed rather than tuned.
 */
const GENERIC_NAMES = new Set([
  'agent',
  'agents',
  'ai',
  'api',
  'app',
  'basic',
  'blog',
  'build',
  'chat',
  'claude',
  'code',
  'coding',
  'common',
  'commit',
  'core',
  'data',
  'debug',
  'default',
  'demo',
  'deploy',
  'design',
  'doc',
  'docs',
  'email',
  'example',
  'examples',
  'general',
  'human',
  'init',
  'main',
  'memory',
  'note',
  'notes',
  'plan',
  'readme',
  'research',
  'review',
  'search',
  'setup',
  'shared',
  'ship',
  'simple',
  'skill',
  'skills',
  'spec',
  'template',
  'templates',
  'test',
  'tests',
  'tool',
  'tools',
  'util',
  'utils',
  'web',
  'write',
  'writing',
])

/**
 * Shortest name matched in plain prose.
 *
 * A single token this long is effectively never an ordinary English word, so
 * finding it is evidence by itself. Shorter single-token names are dropped
 * unless they carry a separator, which is what makes them distinctive.
 */
const MIN_PROSE_TOKEN_LENGTH = 8

/** Below this nothing is matched at all, at any strength. */
const MIN_NAME_LENGTH = 3

const EVIDENCE_RANK: Record<SkillNameEvidence, number> = { slash: 3, quoted: 2, prose: 1 }

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Whether finding this name in ordinary prose means anything.
 *
 * A separator settles it: nobody writes `atproto-oauth` by accident. Otherwise
 * the name has to be long enough that collision is implausible.
 */
function isDistinctive(name: string): boolean {
  if (GENERIC_NAMES.has(name))
    return false
  if (/[-_.]/.test(name))
    return true
  return name.length >= MIN_PROSE_TOKEN_LENGTH
}

/**
 * The forms one skill answers to.
 *
 * The spaced form is not cosmetic. "My Core Data Expert Agent Skill" names
 * `core-data-expert`, and without it that post reads as naming nothing.
 */
function aliasesFor(skill: KnownSkill): string[] {
  const out = new Set<string>()
  for (const raw of [skill.slug, skill.canonicalName]) {
    const name = raw?.toLowerCase().trim()
    if (!name || name.length < MIN_NAME_LENGTH)
      continue
    out.add(name)
    if (/[-_]/.test(name))
      out.add(name.replace(/[-_]+/g, ' '))
  }
  return [...out]
}

function quoteAround(text: string, index: number, radius = 70): string {
  return text
    .slice(Math.max(0, index - radius), index + radius)
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Boundary pattern for one alias.
 *
 * The asymmetry is measured, not stylistic.
 *
 * A hyphenated alias must not begin mid-compound. A plain `\b` matched
 * `skill-repo` inside `agent-skill-repo`, crediting a skill the post never
 * named. Its RIGHT side stays permissive, because repos routinely suffix their
 * own skill: `sega-genesis-sgdk` is genuinely the skill in the repo
 * `sega-genesis-sgdk-skill-for-claude`, and guarding both sides lost it.
 *
 * A spaced alias keeps plain word boundaries. Guarding its left dropped
 * `vc teardown` out of "a skeptical-VC teardown", which is a real match.
 */
function boundaryPattern(alias: string): string {
  const escaped = escapeRegExp(alias)
  return alias.includes(' ')
    ? `\\b${escaped}\\b`
    : `(?<![\\w-])${escaped}(?!\\w)`
}

export interface MatchKnownSkillsInput {
  /** Post text, plus any embed card copy, already joined. */
  text: string
  /** The skills the linked repository actually ships. */
  skills: readonly KnownSkill[]
}

/**
 * Match a post against one repository's skill vocabulary.
 *
 * Returns at most one entry per skill, keeping its strongest evidence. Order
 * follows the vocabulary, not the text, so results are stable across runs.
 */
export function matchKnownSkills(input: MatchKnownSkillsInput): SkillNameMatch[] {
  const text = input.text
  if (!text)
    return []
  const lower = text.toLowerCase()
  const found = new Map<string, SkillNameMatch>()

  const keep = (name: string, evidence: SkillNameEvidence, at: number) => {
    const held = found.get(name)
    if (!held || EVIDENCE_RANK[evidence] > EVIDENCE_RANK[held.evidence])
      found.set(name, { name, evidence, quote: quoteAround(text, at) })
  }

  for (const skill of input.skills) {
    const name = skill.slug.toLowerCase().trim()
    if (name.length < MIN_NAME_LENGTH)
      continue

    for (const alias of aliasesFor(skill)) {
      const escaped = escapeRegExp(alias)

      // `/name`, the convention for talking about a skill. Strongest, and safe
      // even for a generic name: nobody writes "/research" by accident.
      const slash = lower.search(new RegExp(`(?:^|[\\s([«"'])/${escaped}(?!\\w)`))
      if (slash >= 0) {
        keep(name, 'slash', slash)
        continue
      }

      // Quoted or backticked. Also safe for generic names, and this is how a
      // post listing a repo's skills in a table writes every one of them.
      const quoted = lower.search(new RegExp(`["'\`«]${escaped}["'\`»]`))
      if (quoted >= 0) {
        keep(name, 'quoted', quoted)
        continue
      }

      if (!isDistinctive(alias))
        continue

      const bare = lower.search(new RegExp(boundaryPattern(alias)))
      if (bare >= 0)
        keep(name, 'prose', bare)
    }
  }

  return [...found.values()]
}
