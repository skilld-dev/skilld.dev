import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const detailSource = readFileSync('layers/registry/app/components/SkillDetail.vue', 'utf8')
const repoSource = readFileSync('layers/registry/app/pages/gh/[owner]/[repo]/index.vue', 'utf8')
const mainCss = readFileSync('app/assets/css/main.css', 'utf8')

describe('skill dependency UI', () => {
  it('shows canonical dependency links on the skill detail page', () => {
    expect(detailSource).toContain(`aria-label="Required skills"`)
    expect(detailSource).toContain(`v-for="dependency in data.dependencies"`)
    expect(detailSource).toContain(`:to="repoSkillPath(data.owner, data.repo, dependency)"`)
  })

  it('styles dependency references in rendered previews as distinct tags', () => {
    expect(mainCss).toContain('.skill-prose a[data-skill-dependency]')
    expect(mainCss).toContain('font-family: var(--font-mono)')
    expect(mainCss).toContain('text-decoration: none')
    expect(mainCss).toContain('background: var(--ui-bg-muted)')
  })

  it('uses dependency-aware repository cards in flat and grouped layouts', () => {
    expect(repoSource.match(/<RepoSkillCard/g)).toHaveLength(2)
    expect(repoSource).not.toContain('<SkillCard')
  })
})
