// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { frozenNoindexPaths, isPageAdmitted, PAGE_ADMISSIONS, pageRobots } from '../../layers/marketing/app/utils/page-admissions'

describe('freeze audit', () => {
  it('indexes an admitted page and noindexes an audited page with no admission', () => {
    expect(pageRobots('/agents/codex')).toBe('index,follow')
    expect(pageRobots('/agents/windsurf')).toBe('noindex,follow')
    expect(pageRobots('/vs/skills-sh')).toBe('noindex,follow')
  })

  it('leaves pages outside the audit alone', () => {
    expect(isPageAdmitted('/frameworks/react')).toBe(true)
    expect(isPageAdmitted('/accessibility')).toBe(true)
  })

  it('lists exactly the noindex pages for the sitemap to skip', () => {
    const skipped = frozenNoindexPaths()
    expect(skipped).toContain('/agents')
    expect(skipped).not.toContain('/agents/cursor')
    for (const path of skipped)
      expect(pageRobots(path)).toBe('noindex,follow')
    for (const path of Object.keys(PAGE_ADMISSIONS))
      expect(skipped).not.toContain(path)
  })

  it('skips a discovered Agent page that the audit list omits', () => {
    expect(frozenNoindexPaths()).not.toContain('/agents/newcomer')
    const skipped = frozenNoindexPaths(['/agents/newcomer', '/agents/codex', '/frameworks/react'])
    expect(skipped).toContain('/agents/newcomer')
    expect(skipped).not.toContain('/agents/codex')
    expect(skipped).not.toContain('/frameworks/react')
  })

  it('starts a new Agent page noindex until it is admitted', () => {
    expect(pageRobots('/agents/newcomer')).toBe('noindex,follow')
  })
})

it('keeps new comparison pages out of search and the sitemap', () => {
  const path = '/compare/new-writing-skills'
  expect(pageRobots(path)).toBe('noindex,follow')
  expect(frozenNoindexPaths([path])).toContain(path)
})
