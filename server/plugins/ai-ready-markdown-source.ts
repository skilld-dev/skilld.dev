import { skillIdentityFromGhPath } from '#shared/skill-markdown-route'

interface RenderedSkillRow {
  rendered_raw: string | null
  display_name: string | null
  description: string | null
  rendered_at: number | null
}

/**
 * Answer `/gh/<owner>/<repo>/<name>.md` with the SKILL.md we already hold.
 *
 * Without this the module renders the page to HTML and converts it back, which
 * loses fidelity and costs an internal subrequest through the edge. That
 * subrequest was two thirds of the site's 404s on 2026-08-19.
 *
 * One primary-key read on a route that only agents request is a fair trade for
 * removing that subrequest, so this does not need the KV cache the `/gh` hot
 * path uses.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('ai-ready:markdown:source', async (context) => {
    const identity = skillIdentityFromGhPath(context.route)
    if (!identity)
      return

    const db = context.event.context.platform?.db as D1Database | undefined
    if (!db)
      return

    // A skill whose source is gone keeps its 410 and its cached body; serving
    // the same text as clean markdown would undo that.
    const row = await db
      .prepare(`SELECT rendered_raw, display_name, description, rendered_at
                  FROM skills
                 WHERE owner = ? AND repo = ? AND name = ?
                   AND rendered_status = 'ok' AND source_resolved = 1`)
      .bind(identity.owner, identity.repo, identity.name)
      .first<RenderedSkillRow>()
      .catch((error) => {
        emitOperationalEvent(createWideEvent({
          operation: 'ai-ready-markdown-source',
          outcome: 'failed',
          reason: error instanceof Error ? error.message : String(error),
        }))
        return null
      })

    if (!row?.rendered_raw)
      return

    context.source = {
      markdown: row.rendered_raw,
      title: row.display_name ?? identity.name,
      description: row.description ?? undefined,
      updatedAt: row.rendered_at ? new Date(row.rendered_at * 1000).toISOString() : undefined,
    }
  })
})
