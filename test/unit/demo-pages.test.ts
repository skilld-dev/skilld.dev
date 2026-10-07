import { describe, expect, it } from 'vitest'
import { demoPagePath, parseDemoRoute } from '../../shared/demo-pages'

describe('parseDemoRoute', () => {
  it('reads no segments as the board', () => {
    expect(parseDemoRoute([])).toEqual({ _tag: 'index' })
    expect(parseDemoRoute('')).toEqual({ _tag: 'index' })
    expect(parseDemoRoute(undefined)).toEqual({ _tag: 'index' })
  })

  it('reads three segments as one demo', () => {
    expect(parseDemoRoute(['anthropics', 'skills', 'frontend-design'])).toEqual({ _tag: 'demo', key: 'anthropics/skills/frontend-design' })
    expect(parseDemoRoute('anthropics/skills/frontend-design/')).toEqual({ _tag: 'demo', key: 'anthropics/skills/frontend-design' })
  })

  it('refuses any other depth, so a partial or extended path is no page', () => {
    expect(parseDemoRoute(['anthropics'])).toEqual({ _tag: 'invalid' })
    expect(parseDemoRoute(['anthropics', 'skills'])).toEqual({ _tag: 'invalid' })
    expect(parseDemoRoute(['anthropics', 'skills', 'frontend-design', 'live'])).toEqual({ _tag: 'invalid' })
  })

  it('reads back the path demoPagePath builds', () => {
    const path = demoPagePath({ owner: 'anthropics', repo: 'skills', name: 'frontend-design' })
    expect(parseDemoRoute(path.slice('/skills/demos/'.length).split('/'))).toEqual({ _tag: 'demo', key: 'anthropics/skills/frontend-design' })
  })
})
