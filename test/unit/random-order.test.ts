import { describe, expect, it } from 'vitest'
import { shuffled } from '../../app/utils/random-order'

describe('shuffled', () => {
  it('changes display order without changing ranks or the source list', () => {
    const rows = [{ name: 'a', rank: 1 }, { name: 'b', rank: 2 }, { name: 'c', rank: 3 }]
    expect(shuffled(rows, () => 0)).toEqual([rows[1], rows[2], rows[0]])
    expect(rows).toEqual([{ name: 'a', rank: 1 }, { name: 'b', rank: 2 }, { name: 'c', rank: 3 }])
  })

  it('keeps every entry exactly once across different random sequences', () => {
    for (const value of [0, 0.25, 0.5, 0.999])
      expect(shuffled(['a', 'b', 'c', 'd'], () => value).sort()).toEqual(['a', 'b', 'c', 'd'])
    expect(shuffled([], () => 0)).toEqual([])
    expect(shuffled(['a'], () => 0)).toEqual(['a'])
  })
})
