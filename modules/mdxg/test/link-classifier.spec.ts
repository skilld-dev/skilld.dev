// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { classifyDocLinkClick } from '../src/runtime/utils/link-classifier'

function clickOn(target: Element, init: Partial<MouseEventInit> = {}): MouseEvent {
  const e = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init })
  Object.defineProperty(e, 'target', { value: target, configurable: true })
  return e
}

function anchor(attrs: Record<string, string>): HTMLAnchorElement {
  const a = document.createElement('a')
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v)
  return a
}

describe('classifyDocLinkClick', () => {
  it('matches a relative .md link', () => {
    const a = anchor({ href: './other.md' })
    expect(classifyDocLinkClick(clickOn(a))?.href).toBe('./other.md')
  })

  it('matches a fragment-bearing relative link', () => {
    const a = anchor({ href: '../guide.md#section' })
    expect(classifyDocLinkClick(clickOn(a))?.href).toBe('../guide.md#section')
  })

  it('rejects absolute http(s) URLs', () => {
    const a = anchor({ href: 'https://example.com/foo' })
    expect(classifyDocLinkClick(clickOn(a))).toBeNull()
  })

  it('rejects mailto / tel / javascript', () => {
    expect(classifyDocLinkClick(clickOn(anchor({ href: 'mailto:a@b.c' })))).toBeNull()
    expect(classifyDocLinkClick(clickOn(anchor({ href: 'tel:+123' })))).toBeNull()
    expect(classifyDocLinkClick(clickOn(anchor({ href: 'javascript:alert(1)' })))).toBeNull()
  })

  it('rejects pure in-page anchors', () => {
    expect(classifyDocLinkClick(clickOn(anchor({ href: '#section' })))).toBeNull()
  })

  it('rejects target=_blank and download links', () => {
    expect(classifyDocLinkClick(clickOn(anchor({ href: './x.md', target: '_blank' })))).toBeNull()
    expect(classifyDocLinkClick(clickOn(anchor({ href: './x.md', download: '' })))).toBeNull()
  })

  it('rejects modifier-clicks and middle/right buttons', () => {
    const a = anchor({ href: './x.md' })
    expect(classifyDocLinkClick(clickOn(a, { metaKey: true }))).toBeNull()
    expect(classifyDocLinkClick(clickOn(a, { ctrlKey: true }))).toBeNull()
    expect(classifyDocLinkClick(clickOn(a, { button: 1 }))).toBeNull()
  })

  it('finds the anchor when clicking a descendant element', () => {
    const a = anchor({ href: './x.md' })
    const span = document.createElement('span')
    a.appendChild(span)
    expect(classifyDocLinkClick(clickOn(span))?.href).toBe('./x.md')
  })
})
