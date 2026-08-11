export type OwnerProfileViewer
  = | { _tag: 'anonymous' }
    | { _tag: 'signed-in', login: string }

export type OwnerProfileHandoff
  = | { _tag: 'hidden' }
    | { _tag: 'sign-in' }
    | { _tag: 'owner' }

export function resolveOwnerProfileHandoff(
  kind: 'org' | 'user',
  owner: string,
  viewer: OwnerProfileViewer,
): OwnerProfileHandoff {
  if (kind === 'org')
    return { _tag: 'hidden' }

  if (viewer._tag === 'anonymous')
    return { _tag: 'sign-in' }

  return viewer.login.toLowerCase() === owner.toLowerCase()
    ? { _tag: 'owner' }
    : { _tag: 'hidden' }
}
