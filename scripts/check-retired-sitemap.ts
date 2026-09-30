/**
 * Probe every URL in the served `retired` sitemap and fail if the sitemap does
 * not load, is empty, or lists a URL that answers 200. Experiment E, remove
 * 2026-11-11.
 *
 * Usage: pnpm tsx scripts/check-retired-sitemap.ts [origin]
 * The origin defaults to https://skilld.dev.
 *
 * Exit codes: 0 every URL answers 301, 404 or 410; 1 the sitemap failed to
 * load or is empty, or a URL answered something else.
 */
const origin = process.argv[2] ?? 'https://skilld.dev'
const CONCURRENCY = 10
const ALLOWED = new Set([301, 404, 410])
const sitemapUrl = `${origin}/__sitemap__/retired.xml`

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

const sitemap = await fetch(sitemapUrl).catch((error: unknown) => fail(`Could not fetch ${sitemapUrl}: ${String(error)}`))
if (!sitemap.ok)
  fail(`${sitemapUrl} answered ${sitemap.status}`)
const xml = await sitemap.text()
const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => {
  const url = new URL(match[1]!)
  return url.pathname + url.search
})
console.log(`${locs.length} URLs in the retired sitemap`)
if (!locs.length)
  fail(`${sitemapUrl} lists no URLs`)

const bad: string[] = []
let next = 0
async function worker() {
  while (next < locs.length) {
    const path = locs[next++]!
    const response = await fetch(`${origin}${path}`, { method: 'HEAD', redirect: 'manual' })
    if (!ALLOWED.has(response.status))
      bad.push(`${response.status} ${path}`)
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))

if (bad.length)
  fail(`${bad.length} URLs do not answer 301, 404 or 410:\n${bad.slice(0, 50).join('\n')}`)
console.log('every URL answers 301, 404 or 410')
