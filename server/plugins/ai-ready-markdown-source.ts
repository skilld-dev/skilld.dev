import type { SkillIndexInput } from '#layers/registry/server/utils/trending-admission'
import { getQuery, setResponseHeader, setResponseStatus } from 'h3'
import { composeAgentSkillMarkdown, composeSkillForkMarkdown } from '#layers/registry/server/utils/skill-agent-markdown'
import { isSkillIndexable, SKILL_INDEX_INPUT_COLUMNS_SQL } from '#layers/registry/server/utils/trending-admission'
import { repositoryIdentityFromGhPath, skillIdentityFromGhPath } from '#shared/skill-markdown-route'

interface RenderedSkillRow extends SkillIndexInput {
  name: string
  source_resolved: number | null
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
 * Explicit three-segment Skill URLs that are missing (404) or whose upstream
 * source is gone (410) are also answered directly here so nuxt-ai-ready never
 * falls back to full Nuxt SSR error rendering.
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

    // Match the resolved count that chooses the Skill page's canonical URL.
    // Two rows prove ambiguity. Do not pick an arbitrary Skill from a hub.
    // Explicit Skill URLs omit the `source_resolved = 1` filter so we can
    // distinguish missing Skills (404) from deleted upstream sources (410)
    // without falling back to a full HTML SSR render.
    const rows = await db
      .prepare(`SELECT s.name, s.source_resolved, s.rendered_status, s.rendered_raw, s.display_name, s.description, s.rendered_at, s.assets,
                       s.seo_indexable, ${SKILL_INDEX_INPUT_COLUMNS_SQL}
                  FROM skills s JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
                 WHERE s.owner = ? AND s.repo = ?
                   ${identity ? 'AND s.name = ?' : 'AND s.source_resolved = 1'}
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

    if (!rows)
      return

    if (identity && rows.results.length === 0) {
      setResponseStatus(context.event, 404)
      setResponseHeader(context.event, 'x-robots-tag', 'noindex')
      context.source = {
        markdown: `# Page not found\n\nNo Skill is available at \`${context.route}\`.\n\nTry one of these resources:\n\n- [Sitemap](https://skilld.dev/sitemap.xml)\n- [llms.txt](https://skilld.dev/llms.txt)\n`,
        title: 'Page not found',
        description: `No Skill is available at ${context.route}.`,
      }
      return
    }

    if (rows.results.length !== 1)
      return
    const row = rows.results[0]!
    if (identity && row.source_resolved === 0) {
      setResponseStatus(context.event, 410)
      setResponseHeader(context.event, 'x-robots-tag', 'noindex')
      context.source = {
        markdown: `# ${row.display_name ?? row.name}\n\nThis Skill is no longer available because its upstream \`SKILL.md\` source was removed from \`${target.owner}/${target.repo}\`.\n`,
        title: row.display_name ?? row.name,
        description: 'This Skill source is no longer available upstream.',
        updatedAt: row.rendered_at ? new Date(row.rendered_at * 1000).toISOString() : undefined,
      }
      return
    }
    if (row.rendered_status !== 'ok' || !row.rendered_raw)
      return

    // The source shortcut skips HTML, so repeat the same admission rule here.
    setResponseHeader(context.event, 'x-robots-tag', isSkillIndexable(row) ? 'index,follow' : 'noindex,follow')

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
