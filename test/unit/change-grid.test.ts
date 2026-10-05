import { describe, expect, it } from 'vitest'
import { bumpBetween, changeGrid, datedChanges, gridCell } from '../../shared/change-grid'

const DAY = 86_400
// Noon UTC, so a change at any hour of a day stays on that day.
const NOW = 20_000 * DAY + 12 * 3600
const daysAgo = (days: number, hour = 9) => (20_000 - days) * DAY + hour * 3600

describe('change grid layout', () => {
  it.each([
    { days: 0, cell: { column: 12, row: 6 } },
    { days: 6, cell: { column: 12, row: 0 } },
    { days: 7, cell: { column: 11, row: 6 } },
    { days: 90, cell: { column: 0, row: 0 } },
  ])('puts $days days ago at column $cell.column, row $cell.row', ({ days, cell }) => {
    expect(gridCell(days)).toEqual(cell)
  })

  it.each([-1, 91, 1.5])('has no cell for day %d', (days) => {
    expect(gridCell(days)).toBeNull()
  })

  it('counts whole UTC days, so a change late yesterday is one day ago', () => {
    const [change] = datedChanges({ changes: [{ at: daysAgo(1, 23) }] }, NOW)
    expect(change?.daysAgo).toBe(1)
  })

  it('treats a change stamped a little in the future as today', () => {
    const [change] = datedChanges({ changes: [{ at: NOW + 3600 }] }, NOW)
    expect(change?.daysAgo).toBe(0)
  })
})

describe('change grid bumps', () => {
  it.each([
    { previous: '1.0.0', next: '2.0.0', bump: 'major' },
    { previous: '2.0.0', next: '2.1.0', bump: 'minor' },
    { previous: '2.1.0', next: '2.1.1', bump: 'patch' },
    { previous: 'v1.2', next: '1.3', bump: 'minor' },
    { previous: '1.0.0-beta.1', next: '1.0.1', bump: 'patch' },
  ])('reads $previous to $next as $bump', ({ previous, next, bump }) => {
    expect(bumpBetween(previous, next)).toBe(bump)
  })

  it.each([
    { name: 'a missing previous version', previous: null, next: '1.0.0' },
    { name: 'a missing next version', previous: '1.0.0', next: undefined },
    { name: 'an unreadable version', previous: '1.0.0', next: 'latest' },
    { name: 'an unchanged version', previous: '1.2.0', next: '1.2.0' },
    { name: 'a version that went down', previous: '2.0.0', next: '1.9.0' },
  ])('invents no bump for $name', ({ previous, next }) => {
    expect(bumpBetween(previous, next)).toBeNull()
  })

  it('marks each change against the change before it, newest first', () => {
    const changes = datedChanges({
      fromFirst: true,
      changes: [
        { at: daysAgo(2), version: '2.1.0', note: 'Added a refactor checklist' },
        { at: daysAgo(61), version: '1.0.0', note: 'First version' },
        { at: daysAgo(33), version: '2.0.0', note: 'Split red and green steps' },
      ],
    }, NOW)
    expect(changes.map(change => [change.daysAgo, change.mark])).toEqual([
      [2, { _tag: 'bump', bump: 'minor' }],
      [33, { _tag: 'bump', bump: 'major' }],
      [61, { _tag: 'bump', bump: 'first' }],
    ])
  })

  it('gives the oldest change a plain dot unless the history starts at the first version', () => {
    const [oldest] = datedChanges({ changes: [{ at: daysAgo(10), version: '1.0.0' }] }, NOW)
    expect(oldest?.mark).toEqual({ _tag: 'plain' })
  })

  it('gives a first change with no declared version a plain dot', () => {
    const [oldest] = datedChanges({ fromFirst: true, changes: [{ at: daysAgo(10) }] }, NOW)
    expect(oldest?.mark).toEqual({ _tag: 'plain' })
  })

  it('compares only with the change right before, so a gap in versions stays plain', () => {
    const changes = datedChanges({
      changes: [
        { at: daysAgo(30), version: '1.0.0' },
        { at: daysAgo(20) },
        { at: daysAgo(10), version: '1.1.0' },
      ],
    }, NOW)
    expect(changes.map(change => change.mark._tag)).toEqual(['plain', 'plain', 'plain'])
  })
})

describe('change grid cells', () => {
  it('keeps only the 13 weeks and marks the newest change day', () => {
    const cells = changeGrid({
      changes: [
        { at: daysAgo(120), version: '1.0.0' },
        { at: daysAgo(40), version: '1.1.0' },
        { at: daysAgo(5), version: '1.1.1' },
      ],
    }, NOW)
    expect(cells.map(cell => ({ daysAgo: cell.daysAgo, newest: cell.newest, mark: cell.mark }))).toEqual([
      { daysAgo: 5, newest: true, mark: { _tag: 'bump', bump: 'patch' } },
      // The change before the grid still supplies the previous version.
      { daysAgo: 40, newest: false, mark: { _tag: 'bump', bump: 'minor' } },
    ])
  })

  it('puts changes on the same day in one cell with the strongest mark', () => {
    const [cell] = changeGrid({
      changes: [
        { at: daysAgo(3, 8), version: '1.0.0' },
        { at: daysAgo(3, 9), version: '2.0.0', note: 'Rewrote the steps' },
        { at: daysAgo(3, 10), version: '2.0.1', note: 'Fixed a typo' },
      ],
    }, NOW)
    expect(cell?.mark).toEqual({ _tag: 'bump', bump: 'major' })
    expect(cell?.changes.map(change => change.note)).toEqual(['Fixed a typo', 'Rewrote the steps', null])
  })

  it('returns no cells for a Skill with no changes', () => {
    expect(changeGrid({ changes: [] }, NOW)).toEqual([])
  })
})
