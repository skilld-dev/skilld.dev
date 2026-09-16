/**
 * Who can read one account's liked list at /@login/liked.
 *
 * `public`: the owner turned the list on, so anyone can read it.
 * `owner`: the list is private and the viewer is its owner.
 * `hidden`: the list is private and the viewer is someone else, or nobody.
 */
export type LikedListAccess
  = | { _tag: 'public' }
    | { _tag: 'owner' }
    | { _tag: 'hidden' }

export function likedListAccess(input: {
  likesPublic: boolean
  ownerId: number
  viewerId: number | null
}): LikedListAccess {
  if (input.likesPublic)
    return { _tag: 'public' }
  if (input.viewerId === input.ownerId)
    return { _tag: 'owner' }
  return { _tag: 'hidden' }
}

export interface LikedListOwner {
  id: number
  login: string
  name: string | null
  avatar: string | null
}

export type LikedListLookup
  = | { _tag: 'visible', owner: LikedListOwner, access: 'public' | 'owner' }
    | { _tag: 'not_found' }

/**
 * Resolve the list owner and the viewer's access in one read.
 *
 * A private list and a missing account both return `not_found`, so a
 * visitor cannot learn which accounts keep their list private.
 */
export async function lookupLikedList(
  db: D1Database,
  login: string,
  viewerId: number | null,
): Promise<LikedListLookup> {
  const row = await db.prepare(
    `SELECT id, login, name, avatar, likes_public FROM users WHERE login = ?1 COLLATE NOCASE`,
  ).bind(login).first<LikedListOwner & { likes_public: number }>()
  if (!row)
    return { _tag: 'not_found' }

  const access = likedListAccess({ likesPublic: row.likes_public === 1, ownerId: row.id, viewerId })
  if (access._tag === 'hidden')
    return { _tag: 'not_found' }

  return {
    _tag: 'visible',
    owner: { id: row.id, login: row.login, name: row.name, avatar: row.avatar },
    access: access._tag,
  }
}
