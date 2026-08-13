/**
 * Turn a raw X post body into a quotable line for the trending page.
 *
 * Pure, so the rules are testable and the same text reaches both the rendered
 * page and any future notification.
 *
 * What the raw text looks like, and why each rule exists. A visual review of
 * the live page showed the same post rendered as ten unbroken lines carrying
 * half a dozen `t.co` links, twice, because two repos it named both ranked.
 * The links say nothing to a reader (they are shorteners), the length buried
 * every other entry, and the HTML entities came through unescaped.
 */

/** Shortened and full URLs alike: neither is readable inside a quote. */
const URL_PATTERN = /https?:\/\/\S+/g

/**
 * X serves `&amp;`, `&lt;`, `&gt;` in post text. Rendering them as-is shows the
 * entity rather than the character, because Vue escapes on output.
 */
const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': '\'',
  '&nbsp;': ' ',
}

/**
 * Characters kept in the quote. Long enough to carry a real claim, short
 * enough that one entry cannot dominate the page. The full body stays in the
 * database; this only bounds what is shown.
 */
export const EVIDENCE_MAX_CHARS = 240

/**
 * Remove a separator left stranded by URL removal.
 *
 * Posts commonly end "…Bases & Canvas everything - <link>". Once the link
 * goes, the dash is left pointing at nothing, which reads as a truncation bug.
 * Sentence-ending punctuation is kept, because that is real prose.
 */
function trimDanglingSeparator(value: string): string {
  return value.replace(/\s*[-–—·|,;:]+$/, '').trimEnd()
}

export function cleanEvidenceText(raw: string, maxChars = EVIDENCE_MAX_CHARS): string {
  const withoutUrls = raw.replace(URL_PATTERN, ' ')
  const decoded = withoutUrls.replace(
    /&(?:amp|lt|gt|quot|#39|nbsp);/g,
    match => ENTITIES[match] ?? match,
  )
  // Newlines become spaces: a quote block reads as prose, and a post's own
  // line breaks would otherwise stretch one entry down the page.
  const collapsed = trimDanglingSeparator(decoded.replace(/\s+/g, ' ').trim())

  if (collapsed.length <= maxChars)
    return collapsed

  // Cut on a word boundary when one is close, so the quote does not end
  // mid-word. Falls back to a hard cut for scripts without spaces, which is
  // most of the non-English posts in this feed.
  const clipped = collapsed.slice(0, maxChars)
  const lastSpace = clipped.lastIndexOf(' ')
  const body = lastSpace > maxChars * 0.6 ? clipped.slice(0, lastSpace) : clipped
  return `${body.trimEnd()}…`
}
