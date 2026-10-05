import type { H3Event } from 'h3'
import { likeSkill } from './likes'
import { createRepositoryWatches } from './watches'

// Post-OAuth side effects driven by ?action= query string. Anonymous "Like X"
// and "Watch X" clicks bounce through OAuth with an action token; the callback
// acts on the user's behalf once the session exists.

function db(event: H3Event): D1Database {
  return event.context.platform.db
}

interface ParsedReturnTo {
  collectionLogin?: string
  collectionSlug?: string
  skillOwner?: string
  skillRepo?: string
  skillName?: string
}

function parseReturnTo(returnTo: string): ParsedReturnTo {
  const out: ParsedReturnTo = {}
  if (!returnTo)
    return out
  const collection = returnTo.match(/^\/@([^/]+)\/([^/?#]+)/)
  if (collection) {
    out.collectionLogin = collection[1]
    out.collectionSlug = collection[2]
  }
  // The third segment is optional so watch-skill, which only needs the repo,
  // keeps working from a repo page that has no skill name in the path.
  const skill = returnTo.match(/^\/gh\/([^/]+)\/([^/?#]+)(?:\/([^/?#]+))?/)
  if (skill) {
    out.skillOwner = skill[1]
    out.skillRepo = skill[2]
    out.skillName = skill[3]
  }
  return out
}

export async function handleWatchAction(
  event: H3Event,
  userId: number,
  action: string,
  returnTo: string,
): Promise<void> {
  const ctx = parseReturnTo(returnTo)
  const d = db(event)

  // likeSkill derives the repo subscription itself, so there is no separate
  // watch insert here.
  if (action === 'like-skill' && ctx.skillOwner && ctx.skillRepo && ctx.skillName) {
    await likeSkill(d, userId, { owner: ctx.skillOwner, repo: ctx.skillRepo, name: ctx.skillName })
    return
  }

  if (action === 'watch-skill' && ctx.skillOwner && ctx.skillRepo) {
    await createRepositoryWatches(d, userId, [{ owner: ctx.skillOwner, repo: ctx.skillRepo }], 'manual')
    return
  }

  if (action === 'watch-collection' && ctx.collectionLogin && ctx.collectionSlug) {
    const skills = await d.prepare(
      `SELECT cs.owner, cs.repo
       FROM collection_skills_v2 cs
       JOIN collections_v2 c ON c.id = cs.collection_id
       JOIN users u ON u.id = c.author_user_id
       WHERE u.login = ?1 AND c.slug = ?2 AND c.deleted_at IS NULL`,
    ).bind(ctx.collectionLogin, ctx.collectionSlug).all<{ owner: string, repo: string }>()
    const source = `collection:${ctx.collectionSlug}`
    await createRepositoryWatches(d, userId, skills.results ?? [], source)
  }
}
