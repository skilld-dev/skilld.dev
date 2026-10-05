// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { brailleNamesField, fileMinimap, textureSeed } from '../../app/utils/og-texture'

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

describe('fileMinimap', () => {
  const region = { x: 780, y: 0, width: 420, height: 600 }

  it('draws the same files for the same Skill and different files for another', () => {
    const tdd = fileMinimap({ region, seed: textureSeed('mattpocock/skills/tdd') })

    expect(fileMinimap({ region, seed: textureSeed('mattpocock/skills/tdd') })).toEqual(tdd)
    expect(fileMinimap({ region, seed: textureSeed('mattpocock/skills/grill-me') })).not.toEqual(tdd)
  })

  it('stays inside its region and fades in from the left edge', () => {
    const dots = fileMinimap({ region, seed: textureSeed('antfu/skills/vite'), fade: 300 })
    const edge = dots.filter(dot => dot.x < region.x + 30)
    const inner = dots.filter(dot => dot.x > region.x + 300)

    expect(dots.every(inRect(region))).toBe(true)
    expect(Math.max(...edge.map(dot => dot.alpha))).toBeLessThan(Math.min(...inner.map(dot => dot.alpha)))
  })
})
