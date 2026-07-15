import type { AuditEntry, SkillLiveResponse } from 'skilld-protocol/wire'
import { SkillLiveResponseSchema } from 'skilld-protocol/wire'
import { getDB } from '#server/utils/db'

interface SkillsShAuditResponse {
  id?: string
  audits?: AuditEntry[]
}

const FORMATTED_RE = /^([\d,]+(?:\.\d+)?)\s*([KMB])?$/i
const PAGE_INSTALLS_RE = /Weekly Installs[\s\S]{0,400}?text-3xl[^>]*>([^<]+)<\/div>/

function parseFormattedCount(raw: string): number | null {
  const trimmed = raw.trim().replace(/,/g, '')
  const m = FORMATTED_RE.exec(trimmed)
  if (!m)
    return null
  const num = Number(m[1])
  if (!Number.isFinite(num))
    return null
  const suffix = m[2]?.toUpperCase()
  const mult = suffix === 'K' ? 1000 : suffix === 'M' ? 1_000_000 : suffix === 'B' ? 1_000_000_000 : 1
  return Math.max(0, Math.round(num * mult))
}

async function fetchInstallsFromHtml(id: string): Promise<{ installs: number | null, formatted: string | null }> {
  const html = await $fetch<string>(`https://skills.sh/${id}`, {
    headers: {
      'User-Agent': 'skilld.dev SWR proxy (+https://skilld.dev)',
      'Accept': 'text/html',
    },
    responseType: 'text',
    retry: 1,
  }).catch(() => null)
  if (!html)
    return { installs: null, formatted: null }
  const m = PAGE_INSTALLS_RE.exec(html)
  if (!m)
    return { installs: null, formatted: null }
  const rawFormatted = m[1]
  if (!rawFormatted)
    return { installs: null, formatted: null }
  const formatted = rawFormatted.trim()
  return { installs: parseFormattedCount(formatted), formatted }
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
  }).catch(() => null)
  return Array.isArray(data?.audits) ? data!.audits! : []
}

export default defineCachedEventHandler(async (event): Promise<SkillLiveResponse> => {
  const idParam = getRouterParam(event, 'id')
  if (!idParam)
    throw createError({ statusCode: 400, message: 'Missing id parameter' })

  const segments = idParam.split('/').filter(Boolean)
  if (segments.length !== 3)
    throw createError({ statusCode: 400, message: 'id must be {owner}/{repo}/{name}' })

  const [owner, repo, name] = segments
  const id = segments.join('/')

  const [installResult, audits] = await Promise.all([
    fetchInstallsFromHtml(id),
    fetchAuditsFromApi(id),
  ])

  // Write-through to D1 when we have a number; skipped on parse failures so
  // we never zero out a previously-seeded value.
  if (installResult.installs != null) {
    await getDB(event)
      .prepare(`UPDATE skills SET installs = ? WHERE owner = ? AND repo = ? AND name = ?`)
      .bind(installResult.installs, owner, repo, name)
      .run()
      .catch((err) => {
        console.warn('[skill-live] D1 update failed:', (err as Error).message)
      })
  }

  const payload: SkillLiveResponse = {
    id,
    installs: installResult.installs,
    formatted: installResult.formatted,
    audits,
    source: 'skills.sh',
    fetchedAt: new Date().toISOString(),
  }

  // Strict parse in dev/test (catches drift early); soft parse + log in prod
  // (never block a response on a schema mismatch the CLI can already tolerate).
  if (import.meta.dev || import.meta.test) {
    return SkillLiveResponseSchema.parse(payload)
  }
  const parsed = SkillLiveResponseSchema.safeParse(payload)
  if (!parsed.success)
    console.warn('[skill-live] response failed protocol validation:', parsed.error.flatten())
  return payload
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
