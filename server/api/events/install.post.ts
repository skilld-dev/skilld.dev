import { getDB } from '../../utils/db'

interface InstallEventBody {
  surface: string
  kind: 'skill' | 'collection'
  owner?: string
  name?: string
  handle?: string
  slug?: string
}

function validate(raw: unknown): InstallEventBody {
  if (!raw || typeof raw !== 'object')
    throw createError({ statusCode: 400, message: 'Invalid body' })
  const r = raw as Record<string, unknown>
  const surface = typeof r.surface === 'string' ? r.surface : ''
  if (!surface || surface.length > 64)
    throw createError({ statusCode: 400, message: 'Invalid surface' })
  if (r.kind !== 'skill' && r.kind !== 'collection')
    throw createError({ statusCode: 400, message: 'Invalid kind' })
  const optStr = (k: string): string | undefined => {
    const v = r[k]
    if (v === undefined || v === null)
      return undefined
    if (typeof v !== 'string' || v.length > 128)
      throw createError({ statusCode: 400, message: `Invalid ${k}` })
    return v
  }
  return {
    surface,
    kind: r.kind,
    owner: optStr('owner'),
    name: optStr('name'),
    handle: optStr('handle'),
    slug: optStr('slug'),
  }
}

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, validate)
  const db = getDB(event)

  await db.prepare(`
    INSERT INTO install_events (occurred_at, surface, kind, owner, name, handle, slug)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    Date.now(),
    body.surface,
    body.kind,
    body.owner ?? null,
    body.name ?? null,
    body.handle ?? null,
    body.slug ?? null,
  ).run()

  return { ok: true }
})
