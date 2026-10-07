import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RENAMED_CLUSTER_SLUGS } from '../../layers/registry/server/data/clusters'
import { resolveSkillsRoute } from '../../layers/registry/server/utils/skills-route-policy'

describe('skills route policy', () => {
  it('passes known marketing routes through', () => {
    expect(resolveSkillsRoute('/skills/planning', '')).toEqual({ _tag: 'pass' })
    expect(resolveSkillsRoute('/skills/tag/nuxt', '')).toEqual({ _tag: 'pass' })
    expect(resolveSkillsRoute('/skills/leaderboard', '')).toEqual({ _tag: 'pass' })
  })

  it('passes renamed category slugs through to the redirect layer', () => {
    // `plan` stopped being a cluster in the 2026-08-12 rework. It must not 404
    // here, or the 301 in nuxt.config never gets a chance to run.
    for (const legacy of Object.keys(RENAMED_CLUSTER_SLUGS))
      expect(resolveSkillsRoute(`/skills/${legacy}`, ''), legacy).toEqual({ _tag: 'pass' })
  })

  it('passes every static page that exists under pages/skills', () => {
    // The allow-list is hand-maintained, and the middleware runs before the
    // router, so a page missing from it 404s no matter how correct the page
    // is. /skills/trending shipped that way and only showed up when the app
    // was actually loaded. Deriving the expectation from the filesystem means
    // the next page added is caught here instead of in a browser.
    const pagesDir = resolve(process.cwd(), 'layers/marketing/app/pages/skills')
    const staticPages = readdirSync(pagesDir)
      .filter(file => file.endsWith('.vue'))
      .map(file => file.replace(/\.vue$/, ''))
      .filter(name => name !== 'index' && !name.startsWith('['))

    expect(staticPages.length).toBeGreaterThan(0)
    for (const name of staticPages)
      expect(resolveSkillsRoute(`/skills/${name}`, ''), `/skills/${name}`).toEqual({ _tag: 'pass' })
  })

  it('passes demo pages through to the page, which answers an unknown one 404', () => {
    expect(resolveSkillsRoute('/skills/demos/anthropics/skills/frontend-design', '')).toEqual({ _tag: 'pass' })
    expect(resolveSkillsRoute('/skills/demos/anthropics/skills', '')).toEqual({ _tag: 'pass' })
  })

  it('returns a 404 decision for unknown one-segment outcomes', () => {
    expect(resolveSkillsRoute('/skills/not-a-real-outcome', '')).toEqual({
      _tag: 'not_found',
    })
  })

  it('preserves redirects for legacy multi-segment skill routes', () => {
    expect(resolveSkillsRoute('/skills/acme/repo/skill', '?tab=files')).toEqual({
      _tag: 'redirect',
      location: '/gh/acme/repo/skill?tab=files',
    })
  })
})
