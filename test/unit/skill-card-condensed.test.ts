import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'app/components/SkillCard.vue'), 'utf8')

describe('skill card condensed variant', () => {
  it('defines a distinct dense mode without changing the grid default', () => {
    expect(source).toContain(`variant = 'grid'`)
    expect(source).toContain(`variant?: 'grid' | 'list' | 'condensed'`)
    expect(source).toContain(`variant === 'condensed'`)
  })

  it('removes repeated provenance and limits descriptions in condensed mode', () => {
    expect(source).toContain(`const shouldShowOwnerPath = computed(() =>`)
    expect(source).toContain(`showOwnerPath && variant !== 'condensed'`)
    expect(source).toContain(`const skillLinkAriaLabel = computed(() =>`)
    expect(source).toContain(`variant === 'condensed' ? \`/\${skill.name}\``)
    expect(source).toContain(`: \`/\${skill.name} by \${skill.owner}\``)
    expect(source).toContain(`:aria-label="skillLinkAriaLabel"`)
    expect(source).toContain(`? 'mt-1.5 text-sm line-clamp-2'`)
    expect(source).toContain(`: 'mt-2 text-xs line-clamp-3'`)
  })

  it('uses NuxtTime for hydration-safe relative timestamps', () => {
    expect(source).toContain(`timestampFormat ?? (variant === 'condensed' ? 'relative' : 'absolute')`)
    expect(source).toContain('<NuxtTime')
    expect(source).toContain('relative-style="long"')
    expect(source).not.toContain('formatRelativeTime')
    expect(source).not.toContain(`useState('render:now'`)
  })

  it('uses GitHub stars for the automatic signal and has no installs signal', () => {
    expect(source).toContain(`signal = 'auto'`)
    expect(source).toContain(`computed<'stars' | null>`)
    expect(source).toContain('GitHub stars')
    expect(source).not.toContain(`'installs' | 'stars'`)
    expect(source).not.toContain('weekly installs')
  })
})
