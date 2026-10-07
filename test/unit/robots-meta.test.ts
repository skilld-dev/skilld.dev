import { describe, expect, it } from 'vitest'
import { pageRobots } from '../../layers/marketing/app/utils/page-admissions'
import { resolveSkillPageState } from '../../layers/registry/app/utils/skill-page-state'
import { robotsFromHtml } from '../../shared/robots-meta'

function page(robots: string): string {
  return `<html><head><meta charset="utf-8"><meta name="robots" content="${robots}"><title>x</title></head><body></body></html>`
}

describe('robotsFromHtml', () => {
  it('reads the directive the page rendered', () => {
    expect(robotsFromHtml(page('noindex,follow'))).toBe('noindex,follow')
    expect(robotsFromHtml('<meta content="index,follow" name="robots" />')).toBe('index,follow')
  })

  it('lets noindex win when a page carries two tags', () => {
    const html = `${page('index, follow, max-image-preview:large')}<meta name="robots" content="noindex,follow">`
    expect(robotsFromHtml(html)).toBe('noindex,follow')
  })

  it('returns null without a robots tag', () => {
    expect(robotsFromHtml('<html><head><meta name="description" content="x"></head></html>')).toBeNull()
  })
})

describe('header and meta agree', () => {
  it('a Skill page state renders the directive the header repeats', () => {
    const loaded = { _tag: 'loaded', sourceGone: false, registryPath: '/gh/o/r/n', duplicateCanonicalPath: null } as const
    for (const indexable of [true, false]) {
      const state = resolveSkillPageState({ ...loaded, indexable })
      expect(robotsFromHtml(page(state.robots))).toBe(state.robots)
    }
  })

  it('a marketing page directive round-trips', () => {
    for (const path of ['/agents/codex', '/agents/windsurf']) {
      const directive = pageRobots(path)
      expect(robotsFromHtml(page(directive))).toBe(directive)
    }
  })
})
