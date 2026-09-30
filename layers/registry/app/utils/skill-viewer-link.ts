function resolveRelativePath(baseDir: string, href: string): string | null {
  let target = href.replace(/^\.\//, '')
  if (target.startsWith('/')) {
    target = target.slice(1)
    return target.includes('..') ? null : target
  }
  const segments = baseDir ? baseDir.split('/').filter(Boolean) : []
  for (const part of target.split('/')) {
    if (part === '..') {
      if (!segments.length)
        return null
      segments.pop()
    }
    else if (part && part !== '.') {
      segments.push(part)
    }
  }
  return segments.join('/')
}

/**
 * The file a link inside the rendered viewer opens, as a path inside the Skill
 * folder. Null means the link leaves the viewer and the browser follows it.
 */
export function resolveViewerLink(input: {
  href: string
  /** Path of the open document inside the Skill folder; empty for SKILL.md. */
  activeDocPath: string
  /** `/gh/<owner>/<repo>/<skill>/-/`. The server rewrites relative links to it. */
  fileRoutePrefix: string
}): string | null {
  const { href, activeDocPath, fileRoutePrefix } = input
  if (!href || href.startsWith('#') || /^[a-z][a-z0-9+.-]*:\/\//i.test(href))
    return null
  const cleanHref = href.split('#')[0]?.split('?')[0] ?? ''
  const lower = cleanHref.toLowerCase()
  if (!lower.endsWith('.md') && !lower.endsWith('.markdown'))
    return null
  if (cleanHref.startsWith(fileRoutePrefix)) {
    const path = decodeURIComponent(cleanHref.slice(fileRoutePrefix.length))
    return path.split('/').includes('..') ? null : path
  }
  const baseDir = activeDocPath.includes('/')
    ? activeDocPath.slice(0, activeDocPath.lastIndexOf('/'))
    : ''
  return resolveRelativePath(baseDir, cleanHref)
}
