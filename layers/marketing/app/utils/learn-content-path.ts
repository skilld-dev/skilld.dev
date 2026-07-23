export function learnContentPath(slug: string | string[] | undefined): string {
  const segments = Array.isArray(slug)
    ? slug
    : slug
      ? [slug]
      : []

  return ['/learn', ...segments.filter(Boolean)].join('/')
}
