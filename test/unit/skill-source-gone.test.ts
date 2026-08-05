import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const apiPath = join(process.cwd(), 'layers/registry/server/api/skills/[...slug].get.ts')
const componentPath = join(process.cwd(), 'layers/registry/app/components/SkillDetail.vue')
const api = readFileSync(apiPath, 'utf8')
const component = readFileSync(componentPath, 'utf8')

// `microsoft/skills/entra-app-registration` carried source_resolved = 0 while its
// API response reported `resolved: true` and served 200, because resolution was
// computed from the cached render alone and the column was never selected.
describe('source-gone skills', () => {
  it('selects the column the verdict depends on', () => {
    expect(api).toContain('s.source_resolved')
  })

  it('treats a deleted upstream file as unresolved however well it renders', () => {
    expect(api).toContain('const sourceGone = row?.source_resolved === 0')
    expect(api).toMatch(/const sourceResolved = !sourceGone/)
  })

  it('never reports resolution from the cached render alone', () => {
    // The old form. A render status cannot observe an upstream deletion.
    expect(api).not.toMatch(
      /const sourceResolved = Boolean\(rendered\.status === 'ok'/,
    )
  })

  it('reports the verdict to the client', () => {
    expect(api).toContain('sourceGone,')
    expect(api).toContain('gone: sourceGone,')
  })

  it('shows the unavailable banner even when the render status is ok', () => {
    expect(component).toContain(
      `v-if="(data.resolutionStatus && data.resolutionStatus !== 'ok') || data.sourceGone"`,
    )
  })

  // The status code is NOT set here. Skill detail is fetched client-side, so the
  // component never runs during SSR and `setResponseStatus` from it did nothing:
  // production kept answering 200 with `sourceGone` absent from the SSR payload.
  // Serving 410 needs a Nitro-layer decision, tracked separately.
  it('does not pretend to set a status code from a client-fetched component', () => {
    expect(component).not.toContain('setResponseStatus')
  })

  it('says installing will fail, since that is what the reader needs', () => {
    expect(component).toContain('installing it will fail')
  })
})
