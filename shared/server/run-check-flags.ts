import type { RunCheckFlagsResponse } from '#shared/run-check-flags'
import { runCheckFlagKey } from '#shared/run-check-flags'

/**
 * The keys of every flagged Skill (`runCheckFlagKey`), for a curated surface
 * that leaves those Skills out.
 *
 * Artifact delivery owns the run checks, so other layers read them over HTTP
 * (ADR-0001). A failed read logs under `surface` and returns no keys. The
 * surface then shows every Skill, and each Skill page still flags its own run.
 */
export async function fetchFlaggedSkillKeys(surface: string): Promise<ReadonlySet<string>> {
  const response = await $fetch<RunCheckFlagsResponse>('/api/run-checks/flags').catch(() => {
    emitOperationalEvent(createWideEvent({ operation: 'run-check-flags-read', outcome: 'failed', reason: surface }))
    return null
  })
  return new Set(response?.items.map(flag => runCheckFlagKey(flag.owner, flag.repository, flag.name)))
}
