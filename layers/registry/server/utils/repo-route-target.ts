export type RepoRouteTarget
  = | { _tag: 'repo' }
    | { _tag: 'skill', name: string }

export function resolveRepoRouteTarget(names: readonly string[]): RepoRouteTarget {
  const name = names.length === 1 ? names[0] : null
  return name
    ? { _tag: 'skill', name }
    : { _tag: 'repo' }
}
