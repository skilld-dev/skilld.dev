import type { TrackMemberInput, TrackTalkedInput } from '#shared/track-board'
import { describe, expect, it } from 'vitest'
import { MIN_TALKED_SKILLS, resolveTrackRange, trackBoard, trackRangePath } from '#shared/track-board'

const NOW = 1_790_000_000

function talked(name: string): TrackTalkedInput {
  return {
    owner: `${name}-owner`,
    repo: 'skills',
    name,
    canonicalName: name,
    registryPath: `/gh/${name}-owner/skills/${name}`,
    description: `${name} does one thing.`,
    stars: 120,
    posts: [{
      url: `https://x.com/dev/status/${name}`,
      text: `try /${name}`,
      platform: 'x',
      authorHandle: 'dev',
      authorName: null,
      authorAvatar: null,
      favouriteCount: 4,
      postedAt: NOW - 2 * 3600,
    }],
    mentionsByDay: [0, 0, 0, 0, 0, 0, 1],
  }
}

function member(name: string, stars: number, overrides: Partial<TrackMemberInput> = {}): TrackMemberInput {
  return {
    owner: `${name}-owner`,
    repo: 'skills',
    name,
    displayName: name,
    description: null,
    stars,
    registryPath: `/gh/${name}-owner/skills/${name}`,
    repoSkillCount: 4,
    pinned: false,
    ...overrides,
  }
}

const talkedSkills = (count: number) => Array.from({ length: count }, (_, i) => talked(`talked-${i + 1}`))

describe('a track board leads with what devs talked about only above the minimum', () => {
  it('ranks the talked Skills first, each with its posts, at the minimum', () => {
    const board = trackBoard({
      noun: 'design',
      range: 'week',
      talked: talkedSkills(MIN_TALKED_SKILLS),
      members: [member('picked', 10, { pinned: true }), member('starred', 900)],
      clockSeconds: NOW,
    })

    expect(board.sections.map(section => section.heading)).toEqual([
      'Design skills devs talked about this week',
      'Hand-picked design skills',
      'More design skills, ranked by GitHub stars',
    ])
    const [first] = board.sections
    expect(first?.rows.map(row => row.title)).toEqual(['talked-1', 'talked-2', 'talked-3', 'talked-4', 'talked-5'])
    expect(first?.rows[0]?.reason).toMatchObject({ _tag: 'posts', posts: [{ handle: 'dev', when: '2h ago' }] })
  })

  it('leaves the talked Skills in the lists, without posts, one short of the minimum', () => {
    const quiet = talkedSkills(MIN_TALKED_SKILLS - 1)
    const board = trackBoard({
      noun: 'SEO',
      range: 'week',
      talked: quiet,
      members: [member('talked-1', 50), member('other', 400)],
      clockSeconds: NOW,
    })

    expect(board.talkedCount).toBe(MIN_TALKED_SKILLS - 1)
    expect(board.sections.map(section => section.heading)).toEqual(['SEO skills, ranked by GitHub stars'])
    expect(board.sections[0]?.rows.map(row => [row.title, row.reason._tag])).toEqual([
      ['other', 'member'],
      ['talked-1', 'member'],
    ])
  })

  it('names the month in the heading on the month board', () => {
    const board = trackBoard({ noun: 'planning', range: 'month', talked: talkedSkills(6), members: [], clockSeconds: NOW })

    expect(board.sections.map(section => section.heading)).toEqual(['Planning skills devs talked about this month'])
  })

  it('never counts a talked Skill that arrived without a post', () => {
    const bare = { ...talked('bare'), posts: [] }
    const board = trackBoard({
      noun: 'design',
      range: 'week',
      talked: [...talkedSkills(MIN_TALKED_SKILLS - 1), bare],
      members: [],
      clockSeconds: NOW,
    })

    expect(board.talkedCount).toBe(MIN_TALKED_SKILLS - 1)
    expect(board.sections).toEqual([])
  })
})

describe('the lists under the talked section', () => {
  it('shows a talked Skill once, in the talked section', () => {
    const board = trackBoard({
      noun: 'design',
      range: 'week',
      talked: talkedSkills(MIN_TALKED_SKILLS),
      members: [member('talked-2', 5000, { pinned: true }), member('talked-3', 4000), member('kept', 1)],
      clockSeconds: NOW,
    })

    const titles = board.sections.flatMap(section => section.rows.map(row => row.title))
    expect(titles.filter(title => title === 'talked-2')).toHaveLength(1)
    expect(board.sections.at(-1)?.rows.map(row => row.title)).toEqual(['kept'])
  })

  it('lists a Skill once when the members repeat it', () => {
    const pick = member('emil-design-eng', 43_570, { pinned: true })
    const board = trackBoard({
      noun: 'design',
      range: 'week',
      talked: [],
      members: [pick, member('impeccable', 9000, { pinned: true }), pick, member('starred', 100), member('starred', 100)],
      clockSeconds: NOW,
    })

    expect(board.sections.map(section => [section.heading, section.rows.map(row => row.title)])).toEqual([
      ['Hand-picked design skills', ['emil-design-eng', 'impeccable']],
      ['More design skills, ranked by GitHub stars', ['starred']],
    ])
  })

  it('lists one copy of an owner\'s Skill shipped from two repositories, the pick first', () => {
    // `emilkowalski/skill` is the registry identity `emilkowalski/skills` had
    // before a rename, and Anthropic ships `frontend-design` from three repositories.
    const inRepo = (name: string, owner: string, repo: string, stars: number, pinned = false) =>
      member(name, stars, { owner, repo, registryPath: `/gh/${owner}/${repo}/${name}`, pinned })
    const board = trackBoard({
      noun: 'design',
      range: 'week',
      talked: [],
      members: [
        inRepo('emil-design-eng', 'emilkowalski', 'skills', 43_570, true),
        inRepo('frontend-design', 'anthropics', 'claude-code', 149_278),
        inRepo('emil-design-eng', 'emilkowalski', 'skill', 43_570),
        inRepo('frontend-design', 'anthropics', 'skills', 179_743),
        inRepo('animate', 'emilkowalski', 'skills', 43_570),
      ],
      clockSeconds: NOW,
    })

    expect(board.sections.map(section => [section.heading, section.rows.map(row => row.subtitle)])).toEqual([
      ['Hand-picked design skills', ['emilkowalski/skills']],
      ['More design skills, ranked by GitHub stars', ['anthropics/skills', 'emilkowalski/skills']],
    ])
  })

  it('keeps the pin order a person set, and orders the rest by stars', () => {
    const board = trackBoard({
      noun: 'coding',
      range: 'week',
      talked: [],
      members: [
        member('second-pick', 5, { pinned: true }),
        member('first-pick', 9000, { pinned: true }),
        member('small', 10),
        member('large', 70_000),
        member('medium', 300),
      ],
      clockSeconds: NOW,
    })

    expect(board.sections.map(section => [section.heading, section.rows.map(row => row.title)])).toEqual([
      ['Hand-picked coding skills', ['second-pick', 'first-pick']],
      ['More coding skills, ranked by GitHub stars', ['large', 'medium', 'small']],
    ])
  })

  it('prints a run command only for a repository holding one Skill', () => {
    const board = trackBoard({
      noun: 'testing and debugging',
      range: 'week',
      talked: [],
      members: [member('solo', 20, { repoSkillCount: 1 }), member('shared', 10, { repoSkillCount: 6 })],
      clockSeconds: NOW,
    })

    expect(board.sections[0]?.rows.map(row => row.skill)).toEqual([
      { owner: 'solo-owner', repo: 'skills', name: 'solo' },
      null,
    ])
  })
})

describe('track ranges', () => {
  it.each([
    [undefined, 'week'],
    ['month', 'month'],
    [['month', 'week'], 'month'],
    ['all', 'week'],
    ['', 'week'],
  ])('reads ?range=%j as %s', (value, expected) => {
    expect(resolveTrackRange(value)).toBe(expected)
  })

  it('keeps the bare track URL for the week and a query for the month', () => {
    expect(trackRangePath('design', 'week')).toBe('/skills/design')
    expect(trackRangePath('design', 'month')).toBe('/skills/design?range=month')
  })
})
