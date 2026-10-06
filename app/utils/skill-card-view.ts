import type { InstallCopyResult } from '~/composables/useInstallCopy'
import type {
  SkillCardAction,
  SkillCardByline,
  SkillCardLayout,
  SkillCardMetric,
  SkillCardMetricView,
  SkillCardSkill,
  SkillCardView,
} from '~/types/skill-card'
import { githubAvatarProxyUrl } from '#shared/image-proxy'
import { skillRunCmd } from '#shared/skill-commands'
import { formatGithubStars } from './github-stars'
import { resolveAuthorName } from './skill-byline'

export interface SkillCardOptions {
  layout: SkillCardLayout
  byline: SkillCardByline
  metric: SkillCardMetric
  /** Undefined takes the layout's default. */
  actions?: readonly SkillCardAction[]
  /** Undefined takes the layout's default. */
  description?: boolean
  rank?: number | null
  note?: string | null
  trending: boolean
  surface?: string
}

/** The run copy state, which lives in the component that owns the clipboard. */
export interface SkillCardRunState {
  copied: boolean
  copy: () => Promise<InstallCopyResult>
}

/**
 * Cards and rows offer the run command, because running is the default. A
 * compact entry is a link and nothing else. Likes and SKILL.md are opt-in:
 * with few accounts yet, a row of zero hearts reads as an empty room.
 */
export function defaultSkillCardActions(layout: SkillCardLayout): readonly SkillCardAction[] {
  return layout === 'compact' ? [] : ['run']
}

/** A compact entry is a name to scan, so it drops the description unless asked. */
export function defaultSkillCardDescription(layout: SkillCardLayout): boolean {
  return layout !== 'compact'
}

export function skillCardSurface(options: Pick<SkillCardOptions, 'layout' | 'surface'>): string {
  return options.surface ?? `skill-${options.layout}`
}

function metricView(skill: SkillCardSkill, metric: SkillCardMetric): SkillCardMetricView | null {
  if (metric === 'stars') {
    const count = skill.stars ?? 0
    // Zero can mean the stars were never fetched, so it stays hidden.
    if (count <= 0)
      return null
    return { _tag: 'stars', count, text: formatGithubStars(count), title: `${count.toLocaleString('en')} GitHub ${count === 1 ? 'star' : 'stars'}` }
  }
  if (metric === 'likes') {
    const count = skill.likeCount ?? 0
    return { _tag: 'likes', count, text: count.toLocaleString('en'), title: `${count.toLocaleString('en')} ${count === 1 ? 'like' : 'likes'}` }
  }
  if (metric === 'updated') {
    const seconds = skill.modifiedAt || skill.pushedAt
    if (!seconds)
      return null
    const date = new Date(seconds * 1000)
    if (!Number.isFinite(date.getTime()))
      return null
    return {
      _tag: 'updated',
      date,
      iso: date.toISOString(),
      title: `Updated ${new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' }).format(date)}`,
    }
  }
  return null
}

/**
 * Everything a take renders, resolved once from the Skill and the context's
 * options. Every take reads this and never the raw Skill, so two takes cannot
 * disagree on a fact.
 */
export function buildSkillCardView(skill: SkillCardSkill, options: SkillCardOptions, run: SkillCardRunState): SkillCardView {
  const author = resolveAuthorName(skill.owner, skill.authorName)
  const actions = options.actions ?? defaultSkillCardActions(options.layout)
  return {
    layout: options.layout,
    owner: skill.owner,
    repo: skill.repo,
    name: skill.name,
    href: skill.registryPath,
    title: `/${skill.name}`,
    label: `/${skill.name} by ${author ?? skill.owner}`,
    author,
    source: `${skill.owner}/${skill.repo}`,
    byline: options.byline,
    avatar: cssSize => githubAvatarProxyUrl(skill.owner, cssSize * 2),
    description: (options.description ?? defaultSkillCardDescription(options.layout)) ? (skill.description?.trim() || null) : null,
    metricKind: options.metric,
    metric: metricView(skill, options.metric),
    rank: options.rank ?? null,
    note: options.note?.trim() || null,
    trending: options.trending,
    official: skill.official === true,
    run: actions.includes('run')
      ? { command: skillRunCmd(skill.owner, skill.repo, skill.name), copied: run.copied, copy: run.copy }
      : null,
    like: actions.includes('like') ? { count: skill.likeCount ?? 0 } : null,
    sourceUrl: actions.includes('source') ? (skill.skillFileUrl ?? null) : null,
    surface: skillCardSurface(options),
  }
}
