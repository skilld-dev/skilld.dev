import { describe, expect, it } from 'vitest'
import { renderDigest } from '../../layers/identity/server/utils/digest-template'
import {
  SkillAuditResponseSchema,
  SkillDetailResponseSchema,
} from '../../layers/registry/server/schemas/skill-responses'
import { buildOfficialOwnerFilter } from '../../server/utils/recent-publishes-query'

function channelToLinear(value: number): number {
  const channel = value / 255
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4
}

function hexLuminance(hex: string): number {
  const value = hex.slice(1)
  const expanded = value.length === 3
    ? value.split('').map(channel => `${channel}${channel}`).join('')
    : value
  const channels = [0, 2, 4].map(offset => Number.parseInt(expanded.slice(offset, offset + 2), 16))
  return 0.2126 * channelToLinear(channels[0]!)
    + 0.7152 * channelToLinear(channels[1]!)
    + 0.0722 * channelToLinear(channels[2]!)
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = hexLuminance(foreground)
  const backgroundLuminance = hexLuminance(background)
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
}

describe('integrity runtime contracts', () => {
  it('accepts skill responses without retired install fields', () => {
    const detailResponse = {
      owner: 'antfu',
      repo: 'skills',
      name: 'vite',
      displayName: 'Vite',
      stars: 1_000,
      branch: 'main',
      skillPath: 'skills/vite/SKILL.md',
      raw: '# Vite',
      pushedAt: '2026-08-04T00:00:00.000Z',
    }
    const auditResponse = {
      id: 'antfu/skills/vite',
      audits: [],
      source: 'skills.sh' as const,
      fetchedAt: '2026-08-04T00:00:00.000Z',
    }

    expect(SkillDetailResponseSchema.safeParse(detailResponse).success).toBe(true)
    expect(SkillAuditResponseSchema.safeParse(auditResponse).success).toBe(true)

    expect(SkillDetailResponseSchema.safeParse({ ...detailResponse, installs: 1 }).success).toBe(false)
    expect(SkillAuditResponseSchema.safeParse({ ...auditResponse, installs: 1, formatted: '1' }).success).toBe(false)
  })

  it('binds any number of official owners through one JSON parameter', () => {
    const owners = Array.from({ length: 150 }, (_, index) => `owner-${index}`)
    const filter = buildOfficialOwnerFilter([...owners, owners[0]!])

    expect(filter.sql).toBe('a.owner IN (SELECT value FROM json_each(?))')
    expect(filter.params).toHaveLength(1)
    expect(JSON.parse(filter.params[0]!)).toEqual(owners)
  })

  it('keeps the generated digest label at WCAG AA contrast', () => {
    const digest = renderDigest({
      login: 'maintainer',
      windowStart: 1_700_000_000,
      windowEnd: 1_700_086_400,
      unsubscribeUrl: 'https://skilld.dev/unsubscribe/test',
      entries: [{
        owner: 'maintainer',
        repo: 'agent-skills',
        skillNames: ['review'],
        skills: [{ name: 'review', changeCount: 1, commitMessages: [] }],
        changeCount: 1,
        summary: 'Review guidance changed.',
      }],
    })
    const labelColor = digest.html.match(/color:(#[\da-f]{6}|#[\da-f]{3})[^>]*>Generated summary/i)?.[1]

    expect(labelColor).toBeDefined()
    expect(contrastRatio(labelColor!, '#fff')).toBeGreaterThanOrEqual(4.5)
  })
})
