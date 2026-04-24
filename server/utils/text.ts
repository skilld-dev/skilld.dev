export function excerpt(source: string | undefined, max = 200): string | undefined {
  if (!source)
    return undefined
  const stripped = source.replace(/[#>*_`~[\]()!]/g, '').replace(/\s+/g, ' ').trim()
  if (stripped.length <= max)
    return stripped
  return `${stripped.slice(0, max).replace(/\s+\S*$/, '')}...`
}
