/**
 * Thirteen weeks of Skill changes as a day grid, with the version bump of
 * each change when skilld knows it.
 *
 * The grid rolls: today is the bottom right cell, and each column above and
 * to the left holds the seven days before it. Rows are not weekdays.
 *
 * A bump comes only from two declared versions side by side. Few SKILL.md
 * files declare a version, so most changes carry no bump, and the grid draws
 * them as plain dots. This module never guesses one.
 */

export const GRID_WEEKS = 13
export const GRID_DAYS = 7
export const GRID_CELLS = GRID_WEEKS * GRID_DAYS

const DAY_SECONDS = 86_400

export type Bump = 'first' | 'major' | 'minor' | 'patch'

/** A known bump draws rings; an unknown one draws a plain dot. */
export type ChangeMark
  = | { _tag: 'plain' }
    | { _tag: 'bump', bump: Bump }

/** One recorded change to a Skill. */
export interface SkillChange {
  /** Unix seconds. */
  at: number
  /** The version the SKILL.md declared after this change, if it declared one. */
  version?: string | null
  /** What changed, in one line. */
  note?: string | null
}

export interface ChangeHistory {
  changes: readonly SkillChange[]
  /**
   * True when `changes` starts at the first version of the Skill. Only then
   * can the oldest change be a first version. Without it, the oldest change
   * has nothing to compare against and gets a plain dot.
   */
  fromFirst?: boolean
}

export interface DatedChange {
  at: number
  /** Whole UTC days before `now`. Zero is today. */
  daysAgo: number
  version: string | null
  note: string | null
  mark: ChangeMark
}

export interface ChangeCell {
  daysAgo: number
  /** 0 is the oldest week, 12 is this week. */
  column: number
  /** 0 is the top row, 6 is the bottom row. */
  row: number
  /** Every change on this day, newest first. */
  changes: DatedChange[]
  /** The strongest mark of the day. */
  mark: ChangeMark
  /** True for the cell that holds the newest change. */
  newest: boolean
}

const PLAIN: ChangeMark = { _tag: 'plain' }

/** Where a day sits in the grid, or null when it falls outside the 13 weeks. */
export function gridCell(daysAgo: number): { column: number, row: number } | null {
  if (!Number.isInteger(daysAgo) || daysAgo < 0 || daysAgo >= GRID_CELLS)
    return null
  const index = GRID_CELLS - 1 - daysAgo
  return { column: Math.floor(index / GRID_DAYS), row: index % GRID_DAYS }
}

type Semver = readonly [number, number, number]

/** `1`, `1.2`, `1.2.3`, with an optional `v` and any prerelease or build suffix. */
function parseVersion(version: string | null | undefined): Semver | null {
  const match = version?.trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+].*)?$/)
  if (!match)
    return null
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)]
}

/**
 * The bump from one declared version to the next.
 *
 * Null when either version is missing or unreadable, when the version did not
 * change, or when it went down. None of those says how big the change was.
 */
export function bumpBetween(previous: string | null | undefined, next: string | null | undefined): Exclude<Bump, 'first'> | null {
  const a = parseVersion(previous)
  const b = parseVersion(next)
  if (!a || !b)
    return null
  for (const [index, bump] of (['major', 'minor', 'patch'] as const).entries()) {
    if (b[index]! > a[index]!)
      return bump
    if (b[index]! < a[index]!)
      return null
  }
  return null
}

/** Every change, newest first, with its age and its mark. */
export function datedChanges(history: ChangeHistory, now: number): DatedChange[] {
  const today = Math.floor(now / DAY_SECONDS)
  const oldestFirst = [...history.changes].sort((a, b) => a.at - b.at)
  return oldestFirst
    .map((change, index): DatedChange => {
      const version = change.version?.trim() || null
      const previous = oldestFirst[index - 1]
      let mark = PLAIN
      if (previous) {
        const bump = bumpBetween(previous.version, version)
        if (bump)
          mark = { _tag: 'bump', bump }
      }
      else if (history.fromFirst && parseVersion(version)) {
        mark = { _tag: 'bump', bump: 'first' }
      }
      return {
        at: change.at,
        // A clock a little ahead of ours still means today.
        daysAgo: Math.max(0, today - Math.floor(change.at / DAY_SECONDS)),
        version,
        note: change.note?.trim() || null,
        mark,
      }
    })
    .reverse()
}

const STRENGTH: Record<Bump, number> = { patch: 1, minor: 2, major: 3, first: 4 }

function strength(mark: ChangeMark): number {
  return mark._tag === 'bump' ? STRENGTH[mark.bump] : 0
}

/**
 * The change days inside the 13 weeks, newest first.
 *
 * Changes on the same day share one cell, and the cell shows the strongest
 * mark among them. Changes older than the grid still count as the previous
 * version of the first change inside it.
 */
export function changeGrid(history: ChangeHistory, now: number): ChangeCell[] {
  const cells = new Map<number, ChangeCell>()
  for (const change of datedChanges(history, now)) {
    const position = gridCell(change.daysAgo)
    if (!position)
      continue
    const cell = cells.get(change.daysAgo)
    if (cell) {
      cell.changes.push(change)
      if (strength(change.mark) > strength(cell.mark))
        cell.mark = change.mark
      continue
    }
    cells.set(change.daysAgo, {
      daysAgo: change.daysAgo,
      ...position,
      changes: [change],
      mark: change.mark,
      newest: cells.size === 0,
    })
  }
  return [...cells.values()]
}
