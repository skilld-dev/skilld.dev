/**
 * Probe every URL in the served `retired` sitemap and fail if one answers
 * anything but 301, 404 or 410. Experiment E, remove 2026-11-11.
 *
 * Usage: pnpm tsx scripts/check-retired-sitemap.ts [origin]
 * The origin defaults to https://skilld.dev.
 */
const origin = process.argv[2] ?? 'https://skilld.dev'
const CONCURRENCY = 10
const ALLOWED = new Set([301, 404, 410])

const xml = await fetch(`${origin}/__sitemap__/retired.xml`).then(response => response.text())
const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1]!).pathname + new URL(match[1]!).search)
console.log(`${locs.length} URLs in the retired sitemap`)

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

if (bad.length) {
  console.error(`${bad.length} URLs do not answer 301, 404 or 410:\n${bad.slice(0, 50).join('\n')}`)
  process.exit(1)
}
console.log('every URL answers 301, 404 or 410')
