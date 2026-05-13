// Classify a click event on a markdown-rendered region. Returns the resolved
// anchor href when the click should be intercepted as a Document Link (MDXG
// §12), or null when default behavior should run.
export function classifyDocLinkClick(e: MouseEvent): { href: string, anchor: HTMLAnchorElement } | null {
  if (e.defaultPrevented || e.button !== 0)
    return null
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
    return null
  const target = e.target as HTMLElement | null
  const anchor = target?.closest('a[href]') as HTMLAnchorElement | null
  if (!anchor)
    return null
  if (anchor.target && anchor.target !== '_self')
    return null
  if (anchor.hasAttribute('download'))
    return null
  const href = anchor.getAttribute('href') ?? ''
  if (!href || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:'))
    return null
  // Absolute external URLs are out of scope per §12.1.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(href))
    return null
  // Pure in-page anchors (just `#...`) are not document links — the existing
  // outline/scrollspy handles them.
  if (href.startsWith('#'))
    return null
  return { href, anchor }
}
