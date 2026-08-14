/**
 * Find the names of individual skills mentioned in an X post.
 *
 * Pure and dependency-free. Every rule here came from reading real posts, and
 * the counts quoted are from 307 ingested on 2026-08-13.
 *
 * THE CRITICAL DESIGN POINT: this extractor is deliberately generous and is
 * NOT the filter. A candidate only becomes a skill once a `SKILL.md` with a
 * matching directory is found in a repo the post actually links. That check
 * lives in `skill-mention-verify.ts` and it is what makes precision safe.
 *
 * Measured on real data, generous extraction plus verification rejected every
 * false positive without a hand-written blocklist:
 *
 *   - `addyosmani/agent-skills` posts carry /spec /plan /build /test /ship.
 *     Those are slash-COMMANDS the repo's skills define, not skills; its 24
 *     skills are named `api-and-interface-design` and the like. 18 candidates,
 *     all correctly rejected.
 *   - Loose prose patterns threw up `point.`, `primary`, `agent`, `claude`.
 *     All rejected for the same reason.
 *
 * Trying to encode those exclusions as rules here would be endless and would
 * still miss the next dialect. Verification handles them for free.
 */

export type SkillMentionSource = 'slash' | 'prose' | 'install'

export interface SkillMention {
  /** Lowercased candidate name, matched later against SKILL.md directories. */
  name: string
  source: SkillMentionSource
  /** Present when an install command named the repo too, which pins the match. */
  repo: { owner: string, repo: string } | null
}

/**
 * `/name` in prose, the convention people use when talking about a skill.
 * Anchored on a boundary so URL paths do not match.
 */
const SLASH = /(?:^|[\s([«"'])\/([a-z0-9][\w.-]{1,40})\b/gi

/**
 * The same convention spoken aloud. Found `stockforge` and `asd-ste100`, which
 * the slash pattern missed entirely, so prose is worth its false positives.
 */
const PROSE = [
  // Words intervene in real text: "an agent skill yesterday called glossarize".
  /\bskills?\s+(?:\w+\s+){0,3}?(?:called|named)\s+["'`]?([a-z0-9][\w.-]{2,40})/gi,
  /\b(?:built|made|created|shipped|wrote|publish(?:ed)?)\s+(?:a\s+)?["'`]?([a-z0-9][\w.-]{2,40})["'`]?\s+skill\b/gi,
  /\bthe\s+["'`]?([a-z0-9][\w.-]{2,40})["'`]?\s+(?:claude\s+|agent\s+)?skill\b/gi,
  /\bskill\s+we\s+call\s+["'`]?([a-z0-9][\w.-]{2,40})/gi,
]

/**
 * Install commands, which name the repo and the skill in one string and are
 * therefore the strongest signal available. Taken from dexhorthy's /show-me
 * article, whose code block reads exactly:
 *
 *     npx skills add humanlayer/skills --skill show-me
 */
const INSTALL = [
  /npx\s+skills\s+add\s+([\w.-]+)\/([\w.-]+)\s+--skill[= ]+([\w.-]+)/gi,
  /npx\s+skilld\s+add\s+gh:([\w.-]+)\/([\w.-]+)(?:\/([\w.-]+))?(?:\s|$)/gi,
]

/**
 * Obvious non-names that survive the patterns and waste a verification call.
 *
 * `agent` and `claude` are here because "the agent skill" and "a claude skill"
 * are how people describe the category, not a skill's name, and both showed up
 * as candidates in real posts.
 */
const NEVER = new Set([
  'skill',
  'skills',
  'the',
  'a',
  'an',
  'this',
  'that',
  'it',
  'my',
  'your',
  'new',
  'first',
  'agent',
  'agents',
  'claude',
  'coding',
  'ai',
  'open',
  'source',
])

/**
 * Trim punctuation the character class swallows. `.` and `-` are legal inside
 * a skill name but not at its end, and "we call show-me." captured the stop.
 */
function normalizeName(raw: string): string {
  return raw.toLowerCase().replace(/[._-]+$/, '')
}

function acceptable(name: string): boolean {
  if (NEVER.has(name))
    return false
  // A bare number is never a skill name; `/100` came from "7-100" in real text.
  return !/^\d+$/.test(name)
}

export interface SkillMentionInput {
  text: string
  /** Article title, which for an X Article often IS the skill name. */
  articleTitle?: string | null
  /** Article body. Names skills the root post never mentions. */
  articleText?: string | null
  /** Fenced code blocks from an Article, where install commands live. */
  articleCode?: readonly string[]
}

/**
 * Extract every candidate skill name from a post.
 *
 * Ordered by confidence: an install-command match keeps its repo so the
 * verifier can go straight to the right repository instead of trying each
 * link on the post.
 */
export function extractSkillMentions(input: SkillMentionInput): SkillMention[] {
  const found = new Map<string, SkillMention>()

  const add = (name: string, source: SkillMentionSource, repo: SkillMention['repo'] = null) => {
    const key = normalizeName(name)
    if (!acceptable(key))
      return
    const existing = found.get(key)
    // Never downgrade: an install command pins a repo that prose cannot.
    if (!existing || (existing.repo === null && repo !== null))
      found.set(key, { name: key, source, repo })
  }

  // Article title first. "/show-me: compact visual representations…" carries
  // the skill name where the post's own `text` holds nothing but a t.co link.
  const haystacks = [
    input.text ?? '',
    input.articleTitle ?? '',
    input.articleText ?? '',
  ].filter(Boolean)

  for (const code of input.articleCode ?? []) {
    for (const re of INSTALL) {
      for (const m of code.matchAll(re)) {
        const [, owner, repo, skill] = m
        if (owner && repo && skill)
          add(skill, 'install', { owner: owner.toLowerCase(), repo: repo.toLowerCase() })
      }
    }
  }

  for (const hay of haystacks) {
    for (const re of INSTALL) {
      for (const m of hay.matchAll(re)) {
        const [, owner, repo, skill] = m
        if (owner && repo && skill)
          add(skill, 'install', { owner: owner.toLowerCase(), repo: repo.toLowerCase() })
      }
    }
    for (const m of hay.matchAll(SLASH))
      add(m[1]!, 'slash')
    for (const re of PROSE) {
      for (const m of hay.matchAll(re))
        add(m[1]!, 'prose')
    }
  }

  return [...found.values()]
}

/**
 * Names a repository answers to when someone refers to its single root skill.
 *
 * People say the skill's name, not the repository's, so `asd-ste100-skill` is
 * referred to as `asd-ste100`. Without the suffix-stripped alias that match is
 * missed, which it was until measured.
 */
export function rootSkillAliases(repo: string): string[] {
  const base = repo.toLowerCase()
  const stripped = base.replace(/[-_]skills?$/, '')
  return stripped && stripped !== base ? [base, stripped] : [base]
}
