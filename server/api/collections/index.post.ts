interface SkillEntry {
  owner: string
  repo: string
  reason?: string | null
}

interface Body {
  slug?: string
  name?: string
  preamble?: string
  skills?: SkillEntry[]
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const userId = session.user.id
  const body = await readBody<Body>(event)

  const slug = (body?.slug ?? '').trim().toLowerCase()
  const name = (body?.name ?? '').trim()
  const preamble = (body?.preamble ?? '').trim() || null
  const skills = Array.isArray(body?.skills) ? body.skills : []

  if (!SLUG_RE.test(slug))
    throw createError({ statusCode: 400, message: 'Invalid slug' })
  if (!name || name.length > 120)
    throw createError({ statusCode: 400, message: 'Invalid name' })
  if (preamble && preamble.length > 4000)
    throw createError({ statusCode: 400, message: 'Preamble too long' })

  const db = event.context.cloudflare.env.DB as D1Database
  const now = Math.floor(Date.now() / 1000)

  const existing = await db.prepare(
    `SELECT id FROM collections_v2 WHERE author_user_id = ?1 AND slug = ?2`,
  ).bind(userId, slug).first<{ id: number }>()
  if (existing)
    throw createError({ statusCode: 409, message: 'Slug already in use' })

  const insert = await db.prepare(
    `INSERT INTO collections_v2 (author_user_id, slug, name, preamble, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?5)
     RETURNING id`,
  ).bind(userId, slug, name, preamble, now).first<{ id: number }>()
  if (!insert)
    throw createError({ statusCode: 500, message: 'Insert failed' })

  const validSkills = skills
    .filter(s => s && typeof s.owner === 'string' && typeof s.repo === 'string' && s.owner && s.repo)
    .slice(0, 100)
  if (validSkills.length) {
    const stmts = validSkills.map((s, i) => db.prepare(
      `INSERT INTO collection_skills_v2 (collection_id, position, owner, repo, reason)
       VALUES (?1, ?2, ?3, ?4, ?5)`,
    ).bind(insert.id, i, s.owner, s.repo, s.reason ?? null))
    await db.batch(stmts)
  }

  return { ok: true, id: insert.id, login: session.user.login, slug }
})
