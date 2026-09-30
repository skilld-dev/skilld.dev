/**
 * The robots directive a rendered page states in its own HTML.
 *
 * One decision per page. Each page component decides `index` or `noindex` from
 * its data (`skill-page-state.ts`, the admission rule in `trending-admission.ts`,
 * the marketing admissions). The response header must repeat that decision,
 * never make its own: the robots module sets `X-Robots-Tag` before the page
 * renders, from route rules alone, so it said `index, follow` on pages whose
 * HTML said `noindex,follow`. Google obeys the stricter of the two today, but
 * the mismatch can go the other way on another page.
 *
 * Returns null when the HTML carries no robots meta tag. With several tags the
 * one that says `noindex` wins, because that is how crawlers combine them.
 */
export function robotsFromHtml(html: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? []
  const directives: string[] = []
  for (const tag of tags) {
    if (!/\bname\s*=\s*["']?robots["']?/i.test(tag))
      continue
    const content = /\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i.exec(tag)
    const value = content?.[1] ?? content?.[2]
    if (value !== undefined && value.trim())
      directives.push(value.trim())
  }
  if (!directives.length)
    return null
  return directives.find(value => /\bnoindex\b/i.test(value)) ?? directives[0]!
}
