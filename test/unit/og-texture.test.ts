// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { brailleNamesField } from '../../app/utils/og-texture'

function inRect(rect: { x: number, y: number, width: number, height: number }) {
  return (dot: { x: number, y: number }) => dot.x >= rect.x && dot.x <= rect.x + rect.width && dot.y >= rect.y && dot.y <= rect.y + rect.height
}

describe('brailleNamesField', () => {
  it('keeps the text block empty and every dot on the card', () => {
    const text = { x: 60, y: 160, width: 640, height: 260 }
    const dots = brailleNamesField({ width: 1200, height: 600, focal: { x: 590, y: 260 }, clear: [text] })

    expect(dots.length).toBeGreaterThan(500)
    expect(dots.filter(inRect(text))).toEqual([])
    expect(dots.every(inRect({ x: 0, y: 0, width: 1200, height: 600 }))).toBe(true)
  })

  it('draws more dots near the focal point than far from it', () => {
    const focal = { x: 900, y: 300 }
    const dots = brailleNamesField({ width: 1200, height: 600, focal })
    const near = dots.filter(inRect({ x: 800, y: 200, width: 200, height: 200 })).length
    const far = dots.filter(inRect({ x: 0, y: 200, width: 200, height: 200 })).length

    expect(near).toBeGreaterThan(far * 2)
  })
})
