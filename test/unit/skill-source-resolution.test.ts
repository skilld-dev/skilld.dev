import { describe, expect, it } from 'vitest'
import { isSourceResolved } from '#shared/skill-source-resolution'

/**
 * `microsoft/skills/entra-app-registration` served `resolved: true` with a 200
 * while its SKILL.md had been 404 upstream for months, because resolution was
 * read off the cached render alone. The render survives the file being deleted,
 * so it can only ever say "we can still draw this".
 *
 * This was previously guarded by a test that grepped the handler's source for
 * `const sourceGone = row?.source_resolved === 0`. That would have passed on any
 * rewrite that kept the line and broke the logic, and failed on a rename that
 * changed nothing. The verdict is a pure function now, so the incident itself
 * is the test.
 */
describe('skill source resolution', () => {
  const renderable = { renderStatus: 'ok', skillPath: 'skills/a/SKILL.md', raw: '# A' }

  it('reports unresolved when the sync says the file is gone, however well it renders', () => {
    expect(isSourceResolved({ sourceResolved: 0, ...renderable })).toBe(false)
  })

  it('reports resolved when the file is present and renders', () => {
    expect(isSourceResolved({ sourceResolved: 1, ...renderable })).toBe(true)
  })

  it('reports unresolved when the render failed', () => {
    expect(isSourceResolved({ sourceResolved: 1, ...renderable, renderStatus: 'error' })).toBe(false)
  })

  it('reports unresolved when nothing was rendered', () => {
    expect(isSourceResolved({ sourceResolved: 1, ...renderable, raw: null })).toBe(false)
    expect(isSourceResolved({ sourceResolved: 1, ...renderable, skillPath: null })).toBe(false)
  })

  it('treats an unknown sync verdict as not gone, since only 0 is the claim', () => {
    // A row that has never been synced carries null, which is absence of a
    // verdict rather than a verdict of absence.
    expect(isSourceResolved({ sourceResolved: null, ...renderable })).toBe(true)
    expect(isSourceResolved({ sourceResolved: undefined, ...renderable })).toBe(true)
  })
})
