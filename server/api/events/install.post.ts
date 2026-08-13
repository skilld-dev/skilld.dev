import { InstallEventInput } from '~~/server/schemas/install-event'
import { defineApiHandler } from '#shared/server/handler'

export default defineApiHandler({
  schema: InstallEventInput,
  handler: async ({ body, platform }) => {
    await platform.db.prepare(`
      INSERT INTO install_events (occurred_at, surface, kind, owner, name, handle, slug, agent, mode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      Date.now(),
      body.surface,
      body.kind,
      body.owner ?? null,
      body.name ?? null,
      body.handle ?? null,
      body.slug ?? null,
      body.agent ?? null,
      body.mode ?? null,
    ).run()
    return { ok: true as const }
  },
})
