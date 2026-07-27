import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const endpointFiles = [
  'layers/registry/server/api/repos/[owner]/[repo].get.ts',
  'layers/registry/server/api/skills/[...slug].get.ts',
  'layers/registry/server/api/skills-raw/[...slug].get.ts',
  'layers/registry/server/api/skill-files/[...slug].get.ts',
  'layers/registry/server/api/skill-asset/[...slug].get.ts',
  'layers/registry/server/api/skill-related/[...slug].get.ts',
  'layers/registry/server/api/orgs/[owner].get.ts',
] as const

describe('live GitHub endpoint source identity', () => {
  it.each(endpointFiles)('%s resolves stored canonical identity before fetching', (file) => {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8')

    expect(source).toMatch(/resolveRepoSourceIdentit/)
    expect(source).toMatch(/source\.owner/)
    expect(source).toMatch(/source\.repo/)
  })
})
