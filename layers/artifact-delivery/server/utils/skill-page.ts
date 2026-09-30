import type { H3Event } from 'h3'
import type { ResolutionRow } from './state'
import { createWideEvent } from '@harlan-zw/nuxt-wide-events/standalone'
import { setHeader } from 'h3'
import { emitOperationalEvent } from '#server/utils/operational-event'

export interface DeliveredSkillSource {
  owner: string
  repository: string
  skillPath: string
}

/** Ask the registry for the canonical page URL of one Skill; null when it has none. */
export type FetchSkillPageUrl = (source: DeliveredSkillSource) => Promise<string | null>

/**
 * The canonical page URL of the Skill a ready public Resolution delivered.
 *
 * Delivery resolves any public GitHub repository, so a delivered Skill can be
 * absent from the registry. The registry decides, and only it names a URL.
 * A private Artifact has no public page and skips the lookup.
 *
 * The URL is a courtesy on top of delivery. A failed lookup is reported and
 * answers undefined, so a registry outage never fails an Artifact download.
 */
export async function resolveSkillPageUrl(
  row: ResolutionRow,
  fetchPageUrl: FetchSkillPageUrl,
  report: (reason: string) => void,
): Promise<string | undefined> {
  if (row.state !== 'ready' || row.visibility !== 'public')
    return undefined
  if (!row.resolved_owner || !row.resolved_repository || !row.skill_path)
    return undefined
  try {
    return await fetchPageUrl({
      owner: row.resolved_owner,
      repository: row.resolved_repository,
      skillPath: row.skill_path,
    }) ?? undefined
  }
  catch (error) {
    report(error instanceof Error ? error.message : String(error))
    return undefined
  }
}

/**
 * The response header that carries the canonical Skill page URL.
 *
 * It is a header, not a body field. Released CLIs parse a Resolution with
 * `deny_unknown_fields`, so a new body field would fail every one of them
 * with INVALID_RESPONSE. A CLI that does not know the header ignores it.
 */
export const SKILL_PAGE_URL_HEADER = 'skilld-page-url'

/**
 * Set {@link SKILL_PAGE_URL_HEADER} when the registry holds the delivered
 * Skill. {@link resolveSkillPageUrl} wired to the registry layer over HTTP,
 * the only way one layer reads another (ADR-0001).
 *
 * The lookup is one KV read on a warm cache. `/api/skills/page-url` reads D1
 * only when its cache entry is missing or stale.
 */
export async function setSkillPageUrlHeader(event: H3Event, row: ResolutionRow): Promise<void> {
  const pageUrl = await resolveSkillPageUrl(
    row,
    async (source) => {
      const answer = await event.$fetch<{ pageUrl: string | null }>('/api/skills/page-url', {
        query: { owner: source.owner, repo: source.repository, path: source.skillPath },
      })
      return answer.pageUrl
    },
    reason => emitOperationalEvent(createWideEvent({
      operation: 'skill-page-url',
      outcome: 'failed',
      reason,
    })),
  )
  if (pageUrl)
    setHeader(event, SKILL_PAGE_URL_HEADER, pageUrl)
}
