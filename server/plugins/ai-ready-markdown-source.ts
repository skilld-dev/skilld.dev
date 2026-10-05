import { getQuery } from 'h3'
import { composeAgentSkillMarkdown, composeSkillForkMarkdown } from '#layers/registry/server/utils/skill-agent-markdown'
import { repositoryIdentityFromGhPath, skillIdentityFromGhPath } from '#shared/skill-markdown-route'

interface RenderedSkillRow {
  name: string
  rendered_status: string | null
  rendered_raw: string | null
  display_name: string | null
  description: string | null
  rendered_at: number | null
  /** JSON array of `{ path, size, type }`, written by the sync. */
  assets: string
}

/**
 * Answer a Skill URL, including a single-Skill repository's canonical URL,
 * with the SKILL.md we already hold,
 * wrapped in the guidance an Agent needs when the page URL is all it was given.
 *
 * Without this the module renders the page to HTML and converts it back, which
 * loses fidelity and costs an internal subrequest through the edge. That
 * subrequest was two thirds of the site's 404s on 2026-08-19.
 *
 * At most two rows decide whether a URL names one Skill.
 * This avoids the subrequest without the `/gh` hot path's KV cache.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('ai-ready:markdown:source', async (context) => {
    const identity = skillIdentityFromGhPath(context.route)
    const target = identity ?? repositoryIdentityFromGhPath(context.route)
    if (!target)
      return

    const db = context.event.context.platform?.db as D1Database | undefined
    if (!db)
      return

    // A skill whose source is gone keeps its 410 and its cached body; serving
    // the same text as clean markdown would undo that.
    // Match the resolved count that chooses the Skill page's canonical URL.
    // Two rows prove ambiguity. Do not pick an arbitrary Skill from a hub.
    const rows = await db
      .prepare(`SELECT name, rendered_status, rendered_raw, display_name, description, rendered_at, assets
                  FROM skills
                 WHERE owner = ? AND repo = ? AND source_resolved = 1
                   ${identity ? 'AND name = ?' : ''}
                 LIMIT 2`)
      .bind(...(identity ? [target.owner, target.repo, identity.name] : [target.owner, target.repo]))
      .all<RenderedSkillRow>()
      .catch((error) => {
        emitOperationalEvent(createWideEvent({
          operation: 'ai-ready-markdown-source',
          outcome: 'failed',
          reason: error instanceof Error ? error.message : String(error),
        }))
        return null
      })

    if (!rows || rows.results.length !== 1)
      return
    const row = rows.results[0]!
    if (row.rendered_status !== 'ok' || !row.rendered_raw)
      return

    context.source = {
      markdown: getQuery(context.event).action === 'fork'
        ? composeSkillForkMarkdown({ ...target, name: row.name })
        : composeAgentSkillMarkdown({
            ...target,
            name: row.name,
            markdown: row.rendered_raw,
            supportingFiles: parseSupportingFiles(row.assets),
          }),
      title: row.display_name ?? row.name,
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
