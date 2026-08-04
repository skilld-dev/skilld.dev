export function formatGithubStars(stars: number): string {
  if (stars >= 1_000_000)
    return `${(stars / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`
  if (stars >= 10_000)
    return `${Math.round(stars / 1_000)}k`
  if (stars >= 1_000)
    return `${(stars / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return stars.toLocaleString()
}
