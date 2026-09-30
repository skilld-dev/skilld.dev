export type OwnerProfileViewer
  = | { _tag: 'pending' }
    | { _tag: 'anonymous' }
    | { _tag: 'signed-in', login: string }

/**
 * `pending` holds the space the handoff will take while the browser loads the
 * session, so the owner never sees the sign-in invitation first and the page
 * below does not jump for the anonymous visitors who keep it.
 */
export type OwnerProfileHandoff
  = | { _tag: 'hidden' }
    | { _tag: 'pending' }
    | { _tag: 'sign-in' }
    | { _tag: 'owner' }

export function resolveOwnerProfileHandoff(
  kind: 'org' | 'user',
  owner: string,
  viewer: OwnerProfileViewer,
): OwnerProfileHandoff {
  if (kind === 'org')
    return { _tag: 'hidden' }

  if (viewer._tag === 'pending')
    return { _tag: 'pending' }

  if (viewer._tag === 'anonymous')
    return { _tag: 'sign-in' }

  return viewer.login.toLowerCase() === owner.toLowerCase()
    ? { _tag: 'owner' }
    : { _tag: 'hidden' }
}
