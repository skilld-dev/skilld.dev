import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import { glob } from 'tinyglobby'
import { buildTree, toVueRouter4 } from 'unrouting'
import { describe, expect, it, vi } from 'vitest'
import { negotiationVary } from '../../shared/content-negotiation'

// nuxt.config.ts relies on the `defineNuxtConfig` auto-global that only the
// Nuxt CLI provides. Unit tests import the file cold, so provide a
// pass-through first.
const globals = globalThis as Record<string, unknown>
globals.defineNuxtConfig ??= (config: unknown) => config

// The config turns `import.meta.url` into filesystem paths for Nitro aliases.
// Vitest does not give that import a file scheme, so the real `fileURLToPath`
// rejects it. No test here reads an alias value, so the raw href is fine.
vi.mock('node:url', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:url')>()
  return {
    ...actual,
    fileURLToPath: (url: URL | string) => {
      try {
        return actual.fileURLToPath(url)
      }
      catch {
        return typeof url === 'string' ? url : url.href
      }
    },
  }
})

interface RouteRule {
  headers?: Record<string, string>
}

const config = await import('../../nuxt.config') as {
  default: {
    routeRules?: Record<string, RouteRule>
  }
}

const PAGE_ROOTS = [
  'app/pages',
  'layers/admin/app/pages',
  'layers/artifact-delivery/app/pages',
  'layers/identity/app/pages',
  'layers/marketing/app/pages',
  'layers/mcp/app/pages',
  'layers/registry/app/pages',
].map(root => `${process.cwd()}/${root}`)

interface DiscoveredPage {
  file: string
  path: string
}

async function discoverPages(): Promise<DiscoveredPage[]> {
  const files = await glob(PAGE_ROOTS.map(root => `${root}/**/*.vue`), {
    absolute: true,
    ignore: ['**/pages/**/_*.vue'],
  })
  const routes = toVueRouter4(buildTree(files, { roots: PAGE_ROOTS }))
  const pages: DiscoveredPage[] = []

  function visit(route: (typeof routes)[number], parentPath: string): void {
    const path = route.path.startsWith('/') ? route.path : `${parentPath.replace(/\/$/, '')}/${route.path}`
    if (route.file)
      pages.push({ file: route.file, path })
    for (const child of route.children)
      visit(child, path)
  }

  for (const route of routes)
    visit(route, '')

  return pages
}

/** A concrete URL for a route path: every param filled, catch-alls two deep. */
function sampleUrl(path: string): string {
  return path.replace(/:(\w+)(\([^)]*\))?([?*+])?/g, (_, name: string, _pattern: string | undefined, modifier: string | undefined) =>
    modifier === '*' || modifier === '+' ? `sample-${name}/nested` : `sample-${name}`)
}

function normalizePath(path: string): string {
  if (path === '/')
    return '/'
  return path.replace(/\/+$/, '')
}

function matchesRouteRule(pattern: string, url: string): boolean {
  const normPattern = normalizePath(pattern)
  const normUrl = normalizePath(url)

  if (normPattern.endsWith('/**')) {
    const prefix = normPattern.slice(0, -3)
    return prefix === '' || normUrl === prefix || normUrl.startsWith(`${prefix}/`)
  }

  const patternParts = normPattern.split('/').filter(Boolean)
  const urlParts = normUrl.split('/').filter(Boolean)
  if (patternParts.length !== urlParts.length)
    return false

  return patternParts.every((part, i) => part.startsWith(':') || part === '*' || part === urlParts[i])
}

function isPublicEdgeCacheRule(rule: RouteRule | undefined): boolean {
  const cdnCacheControl = rule?.headers?.['cloudflare-cdn-cache-control'] ?? ''
  return /\bpublic\b/i.test(cdnCacheControl) && !/\b(?:private|no-store)\b/i.test(cdnCacheControl)
}

function variesOnUserAgent(path: string): boolean {
  return negotiationVary(path)
    .split(',')
    .map(field => field.trim().toLowerCase())
    .includes('user-agent')
}

describe('edge-cached pages and bot-dependent SSR', () => {
  it('never branches SSR on useBotDetection() on an edge-cached page unless Vary includes User-Agent', async () => {
    const routeRules = config.default.routeRules ?? {}
    const edgeCachePatterns = Object.entries(routeRules)
      .filter(([pattern, rule]) => !pattern.startsWith('/api/') && isPublicEdgeCacheRule(rule))
      .map(([pattern]) => pattern)

    expect(edgeCachePatterns.length).toBeGreaterThan(0)

    const pages = await discoverPages()
    const violations: Array<{ file: string, url: string, matchedRule: string }> = []

    for (const page of pages) {
      const url = sampleUrl(page.path)
      const matchedRule = edgeCachePatterns.find(pattern => matchesRouteRule(pattern, url))
      if (!matchedRule)
        continue
      if (variesOnUserAgent(url))
        continue

      const source = readFileSync(page.file, 'utf8')
      if (/\buseBotDetection\s*\(/.test(source)) {
        violations.push({
          file: relative(process.cwd(), page.file),
          url,
          matchedRule,
        })
      }
    }

    expect(violations).toEqual([])
  })
})
