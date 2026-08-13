import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const homepage = readFileSync(resolve(root, 'app/pages/index.vue'), 'utf8')
const skillDetail = readFileSync(resolve(root, 'layers/registry/app/components/SkillDetail.vue'), 'utf8')
const mePage = readFileSync(resolve(root, 'layers/identity/app/pages/me/index.vue'), 'utf8')
const authoringGuide = readFileSync(resolve(root, 'layers/marketing/content/learn/author-npm-package-skills.md'), 'utf8')

describe('integrity copy and controls', () => {
  it('frames skilld author as a maintainer-owned draft', () => {
    expect(authoringGuide).toContain('starting draft')
    expect(authoringGuide).toContain('edit and own')
    expect(authoringGuide).toContain('your own repository')
    expect(homepage).toContain('starts a draft')
  })

  it('keeps agent names together in skill SEO strings', () => {
    expect(skillDetail).toContain('Claude Code skill for Cursor, Codex, and other agents')
    expect(skillDetail).not.toContain('skill into Claude Code')
  })

  it('links publisher CTAs directly to skills', () => {
    expect(homepage).not.toContain('to="/skills/official"')
    expect(homepage.match(/to="\/skills"\s+label="View publishers"/g)).toHaveLength(2)
  })

  it('uses Nuxt UI fields for cadence editing', () => {
    expect(mePage).toContain('<UInputNumber')
    expect(mePage).toMatch(/<UInput[\s\S]*v-model="cadence\.timezone"/)
    expect(mePage).not.toContain('<input v-model.number="cadence.hour"')
    expect(mePage).not.toContain('<input v-model="cadence.timezone"')
  })
})
