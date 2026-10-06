import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.fn()
vi.stubGlobal('$fetch', fetchMock)
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)

beforeEach(() => {
  fetchMock.mockReset()
})

describe('weekly live preview', () => {
  it('maps the trending feed name into the email Skill slug', async () => {
    fetchMock.mockResolvedValue({
      namedSkills: [{
        owner: 'owner',
        repo: 'skills',
        name: 'skill-a',
        canonicalName: 'Skill A',
        description: null,
        stars: 1,
        attribution: 'social',
        authorCount: 1,
        mentionCount: 1,
        starGain: null,
        starGainDay: null,
        evidence: null,
      }],
    })
    const { liveScenario } = await import('../../server/routes/_dev/weekly.get')

    const scenario = await liveScenario()

    expect(scenario.trending[0]?.slug).toBe('skill-a')
  })
})
