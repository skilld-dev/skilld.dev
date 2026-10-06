/**
 * The board a track page (`/skills/<slug>`) shows, and what each section may claim.
 *
 * A track page reuses the trending board's rows. Its order is not trending's,
 * so every section carries a heading that says what orders it:
 *
 *   talked   Skills in the track that devs posted about in the window, scored
 *            as `/skills/trending` scores them. Only when at least
 *            {@link MIN_TALKED_SKILLS} qualify. ADR-0010 admits this order.
 *   picked   The track's pinned Skills, in the order a person set.
 *   stars    Every other member, ranked by GitHub stars.
 *
 * Pure and kept out of the component, so the section rule and every heading
 * are testable without rendering. A heading that overclaims is a defect.
 */

import type { BoardPostInput, TrendingBoardRow } from './trending-range'
import { boardPost, singleSkill } from './trending-range'

export type TrackRange = 'week' | 'month'

export interface TrackRangeMeta {
  readonly id: TrackRange
  /** Switcher label. */
  readonly label: string
  /** The line under the label in the sidebar: what the range covers. */
  readonly hint: string
  /** Hours of posts the talked section reads. */
  readonly windowHours: number
  /** How a heading names the window. */
  readonly period: string
}

/**
 * The week leads because the talked heading says "this week". The month exists
 * for the tracks whose week is too quiet to rank: on 2026-10-06, three of
 * fourteen tracks cleared the minimum over seven days and six over thirty.
 */
export const DEFAULT_TRACK_RANGE: TrackRange = 'week'

export const TRACK_RANGES: readonly TrackRangeMeta[] = [
  { id: 'week', label: 'Week', hint: 'Last 7 days', windowHours: 24 * 7, period: 'this week' },
  { id: 'month', label: 'Month', hint: 'Last 30 days', windowHours: 24 * 30, period: 'this month' },
]

const RANGE_BY_ID = new Map(TRACK_RANGES.map(range => [range.id, range]))

export function trackRangeMeta(range: TrackRange): TrackRangeMeta {
  return RANGE_BY_ID.get(range) ?? RANGE_BY_ID.get(DEFAULT_TRACK_RANGE)!
}

/**
 * Parse `?range=` once, at the boundary. Anything unrecognised is the default:
 * a stale link is not worth a 404.
 */
export function resolveTrackRange(value: unknown): TrackRange {
  const candidate = Array.isArray(value) ? value[0] : value
  return typeof candidate === 'string' && RANGE_BY_ID.has(candidate as TrackRange)
    ? candidate as TrackRange
    : DEFAULT_TRACK_RANGE
}

/** Where the switcher points. The default range keeps the bare track URL. */
export function trackRangePath(slug: string, range: TrackRange): string {
  return range === DEFAULT_TRACK_RANGE ? `/skills/${slug}` : `/skills/${slug}?range=${range}`
}

/**
 * Skills a talked section needs before it leads the board.
 *
 * Measured in production on 2026-10-06 over seven days, the mentioned Skills
 * per track ran 7, 6, 5, then 3, 2, 1, 1, 1, 1, 1, 1, 1, 0, 0. Five sits in the
 * gap: the three tracks above it carry 12, 14 and 4 devs, and the next one
 * down holds three Skills from three devs, one each. Five is also where the
 * board's head ends and the weekly invitation sits on a narrow screen, so the
 * invitation always follows a full head of rows that devs talked about.
 */
export const MIN_TALKED_SKILLS = 5

/** Rows the talked section shows at most, the trending board's own cap. */
export const MAX_TALKED_ROWS = 30

/** A track member, as `/api/clusters/<slug>` lists it. */
export interface TrackMemberInput {
  owner: string
  repo: string
  name: string
  displayName: string
  description: string | null
  stars: number
  registryPath: string
  /** Skills in the repository. The row prints a run command only at 1. */
  repoSkillCount: number
  /** A person pinned it to the track. */
  pinned: boolean
}

/** A Skill devs posted about, as `/api/clusters/<slug>/talked` lists it, already ranked. */
export interface TrackTalkedInput {
  owner: string
  repo: string
  name: string
  canonicalName: string
  registryPath: string
  description: string | null
  stars: number | null
  /** The quoted post first, then one from each other author. Never empty. */
  posts: readonly BoardPostInput[]
  mentionsByDay: readonly number[] | null
}

export type TrackSectionKind = 'talked' | 'picked' | 'stars'

export interface TrackBoardSection {
  readonly _tag: TrackSectionKind
  /** Heading element id, unique on the page. */
  readonly id: string
  readonly heading: string
  readonly rows: readonly TrendingBoardRow[]
}

export interface TrackBoardInput {
  /** How the track reads before "skills", lowercase unless it is an acronym. */
  noun: string
  range: TrackRange
  /** Ranked, already narrowed to the track. */
  talked: readonly TrackTalkedInput[]
  /** Pinned first, in pin order. */
  members: readonly TrackMemberInput[]
  /** The talked payload's clock, so posts date the same on server and client. */
  clockSeconds: number
}

export interface TrackBoard {
  sections: TrackBoardSection[]
  /** Skills devs talked about in the window, whether or not they cleared the minimum. */
  talkedCount: number
}

function capitalise(phrase: string): string {
  return phrase.charAt(0).toUpperCase() + phrase.slice(1)
}

function talkedRow(skill: TrackTalkedInput, clockSeconds: number): TrendingBoardRow {
  return {
    key: skill.registryPath,
    owner: skill.owner,
    repo: skill.repo,
    name: skill.name,
    title: skill.canonicalName,
    to: skill.registryPath,
    subtitle: `${skill.owner}/${skill.repo}`,
    description: skill.description,
    stars: skill.stars,
    starSeries: [],
    names: [skill.name, skill.canonicalName],
    // A post put this exact Skill here, so the run command never guesses.
    skill: { owner: skill.owner, repo: skill.repo, name: skill.name },
    reason: {
      _tag: 'posts',
      posts: skill.posts.map(post => boardPost(post, clockSeconds)),
      mentionsByDay: skill.mentionsByDay,
    },
  }
}

function memberRow(member: TrackMemberInput): TrendingBoardRow {
  return {
    key: member.registryPath,
    owner: member.owner,
    repo: member.repo,
    name: member.name,
    title: member.displayName || member.name,
    to: member.registryPath,
    subtitle: `${member.owner}/${member.repo}`,
    description: member.description,
    stars: member.stars,
    starSeries: [],
    names: [member.name, member.displayName],
    skill: singleSkill(member.owner, member.repo, member.name, member.repoSkillCount),
    reason: { _tag: 'member' },
  }
}

/**
 * The sections, in page order, each with a heading that says what orders it.
 *
 * A Skill shows once. One devs talked about leaves the lists below, so the
 * page never prints two numbers against one Skill. Under the minimum the
 * talked Skills stay where the lists put them, and draw no posts: a row only
 * draws the signal that ranked it.
 *
 * One owner's Skill of one name is one Skill to a reader, even when two
 * repositories ship it: a moved Repository sits under both names until sync
 * follows the move (ADR-0013), and a plugin bundle copies a Skill under the
 * same name. The
 * first list to claim it keeps it: the talked section, then the pins, then
 * the most-starred copy.
 */
export function trackBoard(input: TrackBoardInput): TrackBoard {
  const { noun, clockSeconds } = input
  const period = trackRangeMeta(input.range).period
  const talked = input.talked.filter(skill => skill.posts.length > 0)
  const leading = talked.length >= MIN_TALKED_SKILLS ? talked.slice(0, MAX_TALKED_ROWS) : []
  const sections: TrackBoardSection[] = []

  const shownPaths = new Set<string>()
  const shownNames = new Set<string>()
  const claim = (skill: { owner: string, name: string, registryPath: string }): boolean => {
    const name = `${skill.owner}/${skill.name}`
    if (shownPaths.has(skill.registryPath) || shownNames.has(name))
      return false
    shownPaths.add(skill.registryPath)
    shownNames.add(name)
    return true
  }

  if (leading.length) {
    leading.forEach(claim)
    sections.push({
      _tag: 'talked',
      id: 'track-talked-heading',
      heading: `${capitalise(noun)} skills devs talked about ${period}`,
      rows: leading.map(skill => talkedRow(skill, clockSeconds)),
    })
  }

  const picked = input.members.filter(member => member.pinned).filter(claim)
  if (picked.length) {
    sections.push({
      _tag: 'picked',
      id: 'track-picked-heading',
      heading: `Hand-picked ${noun} skills`,
      rows: picked.map(memberRow),
    })
  }

  const byStars = input.members
    .filter(member => !member.pinned)
    .sort((a, b) => b.stars - a.stars || a.name.localeCompare(b.name))
    .filter(claim)
  if (byStars.length) {
    sections.push({
      _tag: 'stars',
      id: 'track-stars-heading',
      heading: sections.length
        ? `More ${noun} skills, ranked by GitHub stars`
        : `${capitalise(noun)} skills, ranked by GitHub stars`,
      rows: byStars.map(memberRow),
    })
  }

  return { sections, talkedCount: talked.length }
}
