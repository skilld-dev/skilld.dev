import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('layers/identity/app/components/LikeButton.client.vue', 'utf8')
const card = readFileSync('app/components/SkillCard.vue', 'utf8')

describe('likeButton', () => {
  it('carries toggle semantics for assistive tech', () => {
    expect(source).toContain(':aria-pressed="liked"')
    expect(source).toMatch(/:aria-label="liked \? `Unlike \$\{name\}` : `Like \$\{name\}`"/)
  })

  it('meets the 44px touch target', () => {
    expect(source).toContain('min-h-11')
  })

  it('uses static icon literals so the client bundle scan can resolve them', () => {
    // nuxt.config.ts scans for icon names; a template string silently falls back
    // to the Iconify HTTP API at runtime.
    expect(source).toContain('name="i-lucide-heart-plus"')
    expect(source).toContain('name="i-lucide-heart"')
    expect(source).not.toMatch(/name="i-lucide-heart[^"]*\$\{/)
  })

  it('sends an anonymous click through OAuth carrying the like intent', () => {
    expect(source).toContain(`action: 'like-skill'`)
    expect(source).toContain('returnTo: route.fullPath')
  })

  it('keeps a liked heart visible on cards without hover', () => {
    expect(source).toContain(`? 'opacity-100'`)
    expect(source).toContain('group-hover:opacity-100')
  })

  it('respects reduced motion', () => {
    expect(source).toContain('motion-reduce:transition-none')
  })
})

describe('skillCard like affordance', () => {
  it('renders the heart beside the copy button', () => {
    expect(card).toContain('<LikeButton')
    expect(card).toContain('variant="card"')
  })

  it('reserves room for two controls', () => {
    expect(card).toContain('pr-24')
  })

  it('skips the heart on the condensed single-line variant', () => {
    expect(card).toContain(`showLike && variant !== 'condensed'`)
  })
})

describe('deleted affordances', () => {
  it('no longer references the Save popover or the Watch button', () => {
    expect(card).not.toContain('AddToCollection')
    expect(card).not.toContain('WatchSkillButton')
  })
})

describe('useLikes hydration', () => {
  const composable = readFileSync('layers/identity/app/composables/useLikes.ts', 'utf8')

  it('shares one in-flight request across every mounted heart', () => {
    // A `loaded` boolean alone let the second LikeButton on a page return before
    // the data arrived and snapshot an empty like set, which double-counted the
    // viewer's own like (rendered 2 for a skill with one like).
    expect(composable).toContain('let inflight: Promise<void> | null = null')
    expect(composable).toContain('if (inflight)')
    expect(composable).toContain('return inflight')
  })

  it('only marks loaded once the response has been applied', () => {
    const then = composable.indexOf('liked.value = next')
    const flag = composable.indexOf('loaded.value = true')
    expect(then).toBeGreaterThan(-1)
    expect(flag).toBeGreaterThan(then)
  })

  it('clears the in-flight handle so a failed load can be retried', () => {
    expect(composable).toContain('.finally(')
    expect(composable).toContain('inflight = null')
  })
})

describe('reserved collection slugs', () => {
  it('rejects a collection that would shadow /@login/liked', async () => {
    const { CreateCollectionInput } = await import('../../server/schemas/collection-input')
    const base = { name: 'My picks', preamble: null, skills: [] }

    expect(CreateCollectionInput.safeParse({ ...base, slug: 'liked' }).success).toBe(false)
    expect(CreateCollectionInput.safeParse({ ...base, slug: 'LIKED' }).success).toBe(false)
    expect(CreateCollectionInput.safeParse({ ...base, slug: 'liked-skills' }).success).toBe(true)
  })
})
