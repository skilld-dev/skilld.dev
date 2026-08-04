import type { AuditEntry } from 'skilld-protocol/wire'
import type { SkillAuditResponse } from '../../schemas/skill-responses'
import { SkillAuditResponseSchema } from '../../schemas/skill-responses'

interface SkillsShAuditResponse {
  id?: string
  audits?: AuditEntry[]
}

async function fetchAuditsFromApi(id: string): Promise<AuditEntry[]> {
  // Audit endpoint is documented as auth-optional; 404 means "no audits yet
  // for this skill" rather than a real error, so we squash both into [].
  const data = await $fetch<SkillsShAuditResponse>(`https://skills.sh/api/v1/skills/audit/${id}`, {
    headers: {
      'User-Agent': 'skilld.dev SWR proxy (+https://skilld.dev)',
      'Accept': 'application/json',
    },
    retry: 1,
  }).catch((error) => {
    console.warn(`[skill-live] ${error instanceof Error ? error.message : String(error)}`)
    return null
  })
  return Array.isArray(data?.audits) ? data!.audits! : []
}

export default defineCachedEventHandler(async (event): Promise<SkillAuditResponse> => {
  const idParam = getRouterParam(event, 'id')
  if (!idParam)
    throw createError({ statusCode: 400, message: 'Missing id parameter' })

  const segments = idParam.split('/').filter(Boolean)
  if (segments.length !== 3)
    throw createError({ statusCode: 400, message: 'id must be {owner}/{repo}/{name}' })

  const id = segments.join('/')
  const audits = await fetchAuditsFromApi(id)

  return SkillAuditResponseSchema.parse({
    id,
    audits,
    source: 'skills.sh',
    fetchedAt: new Date().toISOString(),
  })
}, {
  maxAge: 60 * 60, // 1 hour fresh
  staleMaxAge: 60 * 60 * 24 * 7, // 1 week stale-while-revalidate window
  swr: true,
  group: 'skill-live',
  getKey: (event) => {
    const id = getRouterParam(event, 'id') ?? ''
    return id.toLowerCase()
  },
  shouldBypassCache: () => false,
})
