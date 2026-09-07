import { composeAgentSkillMarkdown } from '#layers/registry/server/utils/skill-agent-markdown'
import { skillIdentityFromGhPath } from '#shared/skill-markdown-route'

interface RenderedSkillRow {
  rendered_raw: string | null
  display_name: string | null
  description: string | null
  rendered_at: number | null
  /** JSON array of `{ path, size, type }`, written by the sync. */
  assets: string
}

/**
 * Answer `/gh/<owner>/<repo>/<name>.md` with the SKILL.md we already hold,
 * wrapped in the guidance an Agent needs when the page URL is all it was given.
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
      .prepare(`SELECT rendered_raw, display_name, description, rendered_at, assets
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
      markdown: composeAgentSkillMarkdown({
        ...identity,
        markdown: row.rendered_raw,
        supportingFiles: parseSupportingFiles(row.assets),
      }),
      title: row.display_name ?? identity.name,
      description: row.description ?? undefined,
      updatedAt: row.rendered_at ? new Date(row.rendered_at * 1000).toISOString() : undefined,
    }
  })
})

/**
 * The sync writes `assets` with JSON.stringify, so a parse failure is a broken
 * invariant worth a 500 on this route rather than a quiet empty list.
 */
function parseSupportingFiles(assets: string | null): { path: string }[] {
  if (!assets)
    return []
  const parsed: unknown = JSON.parse(assets)
  if (!Array.isArray(parsed))
    return []
  return parsed.flatMap((entry: unknown) =>
    typeof entry === 'object' && entry !== null && typeof (entry as { path?: unknown }).path === 'string'
      ? [{ path: (entry as { path: string }).path }]
      : [])
}
