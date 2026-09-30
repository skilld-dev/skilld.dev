import type { Component } from 'vue'
import type { Router, RouteRecordRaw } from 'vue-router'
import { relative } from 'node:path'
import { glob } from 'tinyglobby'
import { buildTree, toVueRouter4 } from 'unrouting'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

// Nuxt merges every layer's pages into one router with unrouting. This builds
// the same tree, with a stub component named after each page file.
const PAGE_ROOTS = [
  'app/pages',
  'layers/admin/app/pages',
  'layers/identity/app/pages',
  'layers/marketing/app/pages',
  'layers/registry/app/pages',
].map(root => `${process.cwd()}/${root}`)

interface PageRoute {
  /** Page file relative to its pages directory. */
  page: string
  /** Absolute route path, with parent paths joined in. */
  path: string
}

async function pageRouter(): Promise<{ router: Router, pages: PageRoute[] }> {
  const files = await glob(PAGE_ROOTS.map(root => `${root}/**/*.vue`), { absolute: true })
  const routes = toVueRouter4(buildTree(files, { roots: PAGE_ROOTS }))
  const pages: PageRoute[] = []

  function toRecord(route: (typeof routes)[number], parentPath: string): RouteRecordRaw {
    const path = route.path.startsWith('/') ? route.path : `${parentPath.replace(/\/$/, '')}/${route.path}`
    const page = pageName(route.file)
    pages.push({ page, path })
    return {
      path: route.path,
      component: defineComponent({ name: page }) as Component,
      children: route.children.map(child => toRecord(child, path)),
    }
  }

  const records = routes.map(route => toRecord(route, ''))
  return { router: createRouter({ history: createMemoryHistory(), routes: records }), pages }
}

function pageName(file: string | undefined): string {
  const root = PAGE_ROOTS.find(root => file?.startsWith(`${root}/`))
  return root && file ? relative(root, file) : String(file)
}

/**
 * The page a visitor sees at a URL. The root `<NuxtPage>` renders the first
 * matched record, and a nested page shows only if its parent renders its own
 * `<NuxtPage>`.
 */
function renderedPage(router: Router, url: string): string | undefined {
  return (router.resolve(url).matched[0]?.components?.default as { name?: string } | undefined)?.name
}

/** A concrete URL for a route path: every param filled, catch-alls two deep. */
function sampleUrl(path: string): string {
  return path.replace(/:(\w+)(\([^)]*\))?([?*+])?/g, (_, name: string, _pattern: string | undefined, modifier: string | undefined) =>
    modifier === '*' || modifier === '+' ? `sample-${name}/nested.txt` : `sample-${name}`)
}

describe('page routing', () => {
  it.each([
    '/gh/anthropics/skills/pdf/-/scripts/check_bounding_boxes.py',
    '/gh/anthropics/skills/pdf/-/LICENSE.txt',
    '/gh/anthropics/skills/pdf/-/reference.md',
  ])('renders the file view for the Skill file deep link %s', async (url) => {
    const { router } = await pageRouter()

    expect(renderedPage(router, url)).toBe('gh/[owner]/[repo]/[name]/-/[...file].vue')
  })

  it('renders the Skill page at the Skill URL', async () => {
    const { router } = await pageRouter()

    expect(renderedPage(router, '/gh/anthropics/skills/pdf')).toBe('gh/[owner]/[repo]/[name]/index.vue')
  })

  // A page file with a sibling folder of the same name becomes the parent
  // route of every page in that folder. Without its own `<NuxtPage>`, direct
  // links to those pages render the parent instead. It happened to `/me` and
  // then to Skill file links.
  it('renders every page file at its own URL', async () => {
    const { router, pages } = await pageRouter()

    const misrouted = pages
      .map(({ page, path }) => ({ page, url: sampleUrl(path), rendered: renderedPage(router, sampleUrl(path)) }))
      .filter(({ page, rendered }) => rendered !== page)

    expect(misrouted).toEqual([])
  })
})
