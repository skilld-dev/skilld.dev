import { describe, expect, it } from 'vitest'
import { findEyebrows } from '../../scripts/lib/eyebrow-scan'

function sfc(template: string): string {
  return `<script setup lang="ts">\nconst x = '<h2 class="section-label">'\n</script>\n\n<template>\n${template}\n</template>\n`
}

describe('findEyebrows', () => {
  it('reports a label whose next sibling is a heading', () => {
    const findings = findEyebrows(sfc(`  <div>
    <p class="section-label">
      Community curated
    </p>
    <h2 id="featured">Collections for better agent work.</h2>
  </div>`))

    expect(findings).toEqual([
      { line: 7, heading: 'h2', text: 'Community curated' },
    ])
  })

  it('reports a data-label stacked above a heading too', () => {
    const findings = findEyebrows(sfc(`  <div>
    <p class="data-label mt-2">Source files changed</p>
    <h3>Recently updated</h3>
  </div>`))

    expect(findings.map(finding => finding.text)).toEqual(['Source files changed'])
  })

  it('accepts a label that is itself the heading', () => {
    expect(findEyebrows(sfc(`  <section>
    <h2 class="section-label">Install</h2>
    <p>One command installs the collection.</p>
  </section>`))).toEqual([])
  })

  it('accepts a label demoted below the heading', () => {
    expect(findEyebrows(sfc(`  <div>
    <h2>Trending this week</h2>
    <p class="data-label">6 repositories</p>
  </div>`))).toEqual([])
  })

  it('accepts a group label whose siblings are list items, not headings', () => {
    expect(findEyebrows(sfc(`  <div role="listbox">
    <p class="section-label">Recent searches</p>
    <ul><li>nuxt</li></ul>
  </div>`))).toEqual([])
  })

  it('does not treat a heading in an outer block as the label sibling', () => {
    expect(findEyebrows(sfc(`  <div>
    <span>
      <span class="data-label block">Liked by</span>
      <span>@harlanzw</span>
    </span>
    <h1>Liked skills</h1>
  </div>`))).toEqual([])
  })

  it('forgets a label once its parent closes, before a heading at the same depth elsewhere', () => {
    expect(findEyebrows(sfc(`  <nav>
    <span>
      <span>CLI</span>
      <span class="data-label">Recommended</span>
    </span>
  </nav>
  <section>
    <div>
      <h3>Install the skilld Skill</h3>
    </div>
  </section>`))).toEqual([])
  })

  it('ignores markup that only appears inside script and style blocks', () => {
    expect(findEyebrows(`<script setup lang="ts">
const markup = '<p class="section-label">Label</p><h2>Heading</h2>'
</script>

<template>
  <div>{{ markup }}</div>
</template>
`)).toEqual([])
  })

  it('steps over void and self-closing elements between the label and the heading', () => {
    const findings = findEyebrows(sfc(`  <div>
    <p class="section-label">Method</p>
    <img src="/rule.svg" alt="">
    <h2>A deliberately narrow list.</h2>
  </div>`))

    expect(findings).toEqual([])
  })
})
