import type { InstallCopyResult } from '~/composables/useInstallCopy'

/**
 * One Skill as every embed reads it. A registry row, a search hit, a feed
 * item or a presenter answer maps onto this before it renders, so the card
 * never learns which API it came from.
 */
export interface SkillCardSkill {
  owner: string
  repo: string
  /** The Skill directory name, the last segment of `owner/repo/name`. */
  name: string
  /** The final public route. Never rebuilt from the other fields. */
  registryPath: string
  description?: string | null
  stars?: number | null
  likeCount?: number | null
  /** Epoch seconds of the last change to the Skill. */
  modifiedAt?: number | null
  /** Epoch seconds of the last push to the Repository, the fallback for `modifiedAt`. */
  pushedAt?: number | null
  /** GitHub profile name of the owner, when the owner has been synced. */
  authorName?: string | null
  /** SKILL.md on GitHub at the synced revision. */
  skillFileUrl?: string | null
  official?: boolean
}

/**
 * Where the card sits.
 *
 * - `card`: a tile in a grid, or one embed in an article.
 * - `row`: one line of a divided list, a ledger or a ranked board.
 * - `compact`: a dense entry in a sidebar, an index or a menu.
 */
export type SkillCardLayout = 'card' | 'row' | 'compact'

/**
 * How much provenance the card repeats.
 *
 * - `full`: avatar, author and `owner/repo`.
 * - `repo`: the Repository name alone, on a page that already names the owner.
 * - `none`: nothing, on a page that already names the Repository.
 */
export type SkillCardByline = 'full' | 'repo' | 'none'

/** The one metric a card shows. DESIGN.md: one key metric per item. */
export type SkillCardMetric = 'stars' | 'likes' | 'updated' | 'none'

/**
 * The controls a card offers.
 *
 * - `run`: copy the run command. Running is the default, so it leads.
 * - `like`: the like heart, which also watches the Skill.
 * - `source`: open SKILL.md on GitHub.
 */
export type SkillCardAction = 'run' | 'like' | 'source'

export type SkillCardMetricView
  = | { _tag: 'stars', count: number, text: string, title: string }
    | { _tag: 'likes', count: number, text: string, title: string }
    | { _tag: 'updated', date: Date, iso: string, title: string }

/**
 * Everything a take renders, resolved once by `SkillCard`. A take reads this
 * and never the raw Skill, so every take shows the same facts.
 */
export interface SkillCardView {
  layout: SkillCardLayout
  owner: string
  repo: string
  name: string
  href: string
  /** `/name`, the one form a Skill name takes in every embed. */
  title: string
  /** Accessible name of the main link. */
  label: string
  /** The person, when GitHub knows a name that differs from the handle. */
  author: string | null
  /** `owner/repo`. */
  source: string
  byline: SkillCardByline
  /** Square GitHub avatar URL at twice the CSS size. */
  avatar: (cssSize: number) => string
  description: string | null
  /** The metric the context asked for, so a row can drop its metric column when it is `none`. */
  metricKind: SkillCardMetric
  /** Null when the metric is off, or unknown for this Skill. */
  metric: SkillCardMetricView | null
  /** One-based position in a ranked list. */
  rank: number | null
  /** Why the Skill is here, in a curator's or editor's words. */
  note: string | null
  trending: boolean
  official: boolean
  /** `copy` reports a refused clipboard, so the pill can hand over the command by hand. */
  run: { command: string, copied: boolean, copy: () => Promise<InstallCopyResult> } | null
  like: { count: number } | null
  /** SKILL.md on GitHub, when the `source` action is on and the link is known. */
  sourceUrl: string | null
  /** Analytics surface of the run copy. */
  surface: string
}
