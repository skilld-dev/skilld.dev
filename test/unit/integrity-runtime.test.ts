import { describe, expect, it } from 'vitest'
import {
  SkillAuditResponseSchema,
  SkillDetailResponseSchema,
} from '../../layers/registry/server/schemas/skill-responses'
import { buildOfficialOwnerFilter } from '../../server/utils/recent-publishes-query'

describe('integrity runtime contracts', () => {
  it('accepts skill responses without retired install fields', () => {
    const detailResponse = {
      owner: 'antfu',
      repo: 'skills',
      name: 'vite',
      registryPath: '/gh/antfu/skills/vite',
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
})
