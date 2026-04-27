import { z } from 'zod'
import { getDB } from '../../utils/db'

const Body = z.object({
  surface: z.string().min(1).max(64),
  kind: z.enum(['skill', 'collection']),
  owner: z.string().max(128).optional(),
  name: z.string().max(128).optional(),
  handle: z.string().max(128).optional(),
  slug: z.string().max(128).optional(),
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, Body.parse)
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
