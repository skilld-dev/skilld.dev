import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const cardSource = readFileSync('layers/registry/app/pages/gh/[owner]/[repo]/_RepoSkillCard.vue', 'utf8')
const pageSource = readFileSync('layers/registry/app/pages/gh/[owner]/[repo]/index.vue', 'utf8')

describe('spacious repository dependency cards', () => {
  it('gives cards more room in a maximum two-column inventory after the tablet breakpoint', () => {
    expect(pageSource.match(/lg:grid-cols-2/g)).toHaveLength(2)
    expect(pageSource).not.toContain('md:grid-cols-2')
    expect(pageSource).not.toContain('lg:grid-cols-3')
    expect(pageSource).toContain('v-else-if="sortedRepoSkills.length && !groupedSkills"')
    expect(pageSource).toContain('class="grid gap-3"')
    expect(cardSource).toContain('min-h-36')
    expect(cardSource).toContain('p-4')
    expect(cardSource).toContain('line-clamp-3')
  })

  it('renders compact canonical dependency links outside the primary card link', () => {
    expect(cardSource).toContain(`v-for="dependency in visibleDependencies"`)
    expect(cardSource).toContain(`:to="repoSkillPath(skill.owner, skill.repo, dependency)"`)
    expect(cardSource).toContain('Requires')
    expect(cardSource).toContain('min-h-8')
    expect(cardSource).toContain('pointer-events-auto')
    expect(cardSource).toContain('relative z-10')
  })

  it('caps dependency links at three and summarizes the rest', () => {
    expect(cardSource).toContain('skill.dependencies?.slice(0, 3)')
    expect(cardSource).toContain('skill.dependencies?.slice(3)')
    expect(cardSource).toContain('+{{ hiddenDependencies.length }}')
    expect(cardSource).toContain('more dependencies:')
  })

  it('shows relative per-skill update time without repo-level metadata', () => {
    expect(cardSource).toContain('modifiedAt?: number | null')
    expect(cardSource).toContain('useTimeAgo')
    expect(cardSource).toContain('Updated {{ modifiedAtAgo }}')
    expect(cardSource).not.toContain('Added {{')
    expect(cardSource).toContain(`name="i-lucide-clock"`)
    expect(cardSource).not.toContain('skill.stars')
    expect(cardSource).not.toContain('trustTier')
  })
})
