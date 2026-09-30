import { describe, expect, it } from 'vitest'
import { resolveViewerLink } from '../../layers/registry/app/utils/skill-viewer-link'

const fileRoutePrefix = '/gh/anthropics/skills/mcp-builder/-/'

describe('skill viewer link', () => {
  it('opens a server-rewritten file route as a path inside the Skill folder', () => {
    expect(resolveViewerLink({
      href: '/gh/anthropics/skills/mcp-builder/-/reference/evaluation.md',
      activeDocPath: '',
      fileRoutePrefix,
    })).toBe('reference/evaluation.md')
  })

  it('resolves a relative link against the open document folder', () => {
    expect(resolveViewerLink({ href: '../forms.md', activeDocPath: 'reference/intro.md', fileRoutePrefix })).toBe('forms.md')
    expect(resolveViewerLink({ href: './deep.md#usage', activeDocPath: 'reference/intro.md', fileRoutePrefix })).toBe('reference/deep.md')
  })

  it('leaves external links, anchors, non-Markdown files, and escapes to the browser', () => {
    expect(resolveViewerLink({ href: 'https://example.com/a.md', activeDocPath: '', fileRoutePrefix })).toBeNull()
    expect(resolveViewerLink({ href: '#setup', activeDocPath: '', fileRoutePrefix })).toBeNull()
    expect(resolveViewerLink({ href: 'scripts/run.py', activeDocPath: '', fileRoutePrefix })).toBeNull()
    expect(resolveViewerLink({ href: '../../secret.md', activeDocPath: '', fileRoutePrefix })).toBeNull()
    expect(resolveViewerLink({ href: '/gh/anthropics/skills/mcp-builder/-/../x.md', activeDocPath: '', fileRoutePrefix })).toBeNull()
  })
})
