import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const componentSource = readFileSync(
  'app/components/community/_CommunityCreator.vue',
  'utf8',
)

describe('community creator card', () => {
  it('does not override the display mode required by line clamping', () => {
    const clampedClassLists = Array.from(
      componentSource.matchAll(/class="([^"]*\bline-clamp-3\b[^"]*)"/g),
      match => match[1]!.split(/\s+/),
    )

    expect(clampedClassLists).toHaveLength(2)
    expect(clampedClassLists.every(classList => !classList.includes('block'))).toBe(true)
  })

  it('reveals an ordered collection skill preview from card width', () => {
    expect(componentSource).toContain('Included skills')
    expect(componentSource).toContain('v-for="skill in creator.topCollection.skills"')
    expect(componentSource).toContain('container-type: inline-size')
    expect(componentSource).toMatch(/@container[^{]*\(min-width:\s*36rem\)/)
  })

  it('uses native list semantics for collection skills', () => {
    expect(componentSource).toContain('<ul class="community-contribution__skill-list">')
    expect(componentSource).toContain('<li\n              v-for="skill in creator.topCollection.skills"')
    expect(componentSource).not.toMatch(/role="list(?:item)?"/)
  })

  it('does not repeat profile and featured metadata', () => {
    expect(componentSource).not.toContain('View profile')
    expect(componentSource).not.toContain('Featured curator')
    expect(componentSource).toContain('v-if="displayName !==')
  })

  it('hides the collection count when the full skill preview is visible', () => {
    expect(componentSource).toContain('community-contribution__count--previewed')
    expect(componentSource).toMatch(/@container[^{]*\(min-width:\s*36rem\)[\s\S]*community-contribution__count--previewed[\s\S]*display:\s*none/)
  })
})
