import type { H3Event } from 'h3'

// Post-OAuth side effects driven by ?action= query string. Anonymous "Watch X"
// clicks bounce through OAuth with an action token; the callback acts on the
// user's behalf once the session exists.

function db(event: H3Event): D1Database {
  return event.context.platform.db
}

interface ParsedReturnTo {
  collectionLogin?: string
  collectionSlug?: string
  skillOwner?: string
  skillRepo?: string
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
  const skill = returnTo.match(/^\/gh\/([^/]+)\/([^/?#]+)/)
  if (skill) {
    out.skillOwner = skill[1]
    out.skillRepo = skill[2]
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
  const now = Math.floor(Date.now() / 1000)
  const d = db(event)

  if (action === 'watch-skill' && ctx.skillOwner && ctx.skillRepo) {
    await d.prepare(
      `INSERT OR IGNORE INTO skill_subscriptions (user_id, owner, repo, source, created_at)
       VALUES (?1, ?2, ?3, 'manual', ?4)`,
    ).bind(userId, ctx.skillOwner, ctx.skillRepo, now).run()
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
    const stmts = (skills.results ?? []).map(r => d.prepare(
      `INSERT OR IGNORE INTO skill_subscriptions (user_id, owner, repo, source, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5)`,
    ).bind(userId, r.owner, r.repo, source, now))
    if (stmts.length)
      await d.batch(stmts)
  }
}
