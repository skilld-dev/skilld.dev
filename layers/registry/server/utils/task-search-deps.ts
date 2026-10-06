import type { H3Event } from 'h3'
import type { Platform } from '#shared/server/platform'
import type { TaskSearchRequest, TaskSearchSkill } from './task-search'
import type { TaskSearchReport, TaskSearchShellDeps } from './task-search-run'
import { getHeader } from 'h3'
import { runAfterResponse } from './after-response'
import { sha256Hex } from './skill-box-search'
import { querySkills, registrySkillKey } from './skills-registry'
import { TASK_SEARCH_MODEL, TASK_SEARCH_RESULTS_PER_QUERY } from './task-search'

/** The Workers AI binding, as it takes an `openai/*` Chat Completions request. */
interface ModelBinding {
  run: (model: string, input: TaskSearchRequest) => Promise<unknown>
}

interface TaskSearchConfig {
  enabled?: unknown
  dailyBudgetMicros?: unknown
}

/**
 * A model error as the log may hold it: a leading status or
 * Workers AI code such as `2021` (no AI Gateway credits), else the error
 * name. Never the message, which may quote the request.
 */
export function modelErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return /^\D{0,40}(\d{3,5})\b/.exec(message)?.[1] ?? (error instanceof Error ? error.name : 'unknown')
}

function reportLevel(report: TaskSearchReport): 'info' | 'warn' {
  if (report._tag === 'skipped')
    return report.reason === 'binding-missing' ? 'warn' : 'info'
  if (report._tag === 'model')
    return report.result._tag === 'failed' ? 'warn' : 'info'
  return 'info'
}

/** One wide event per request. The field validator needs each event as an object literal. */
function emitReport(report: TaskSearchReport): void {
  const level = reportLevel(report)
  if (report._tag === 'skipped') {
    emitOperationalEvent(createWideEvent({ operation: 'task-search', outcome: 'skipped', reason: report.reason }), level)
    return
  }
  if (report._tag === 'cache') {
    emitOperationalEvent(createWideEvent({ operation: 'task-search', outcome: report.result, reason: 'cache' }), level)
    return
  }
  const { result } = report
  emitOperationalEvent(createWideEvent({
    'operation': 'task-search',
    'outcome': result._tag,
    'reason': result._tag === 'failed' ? result.reason : 'model-call',
    'model.durationMs': report.durationMs,
    'model.turns': result.turns,
    'model.searches': result.searches,
    'model.inputTokens': result.usage.inputTokens,
    'model.cachedTokens': result.usage.cachedTokens,
    'model.outputTokens': result.usage.outputTokens,
    'model.costMicros': report.costMicros,
    'model.droppedRefs': result._tag === 'failed' ? 0 : result.dropped,
    'model.errorCode': result._tag === 'failed' && result.reason === 'model-error' ? modelErrorCode(result.error) : null,
  }), level)
}

/**
 * Bindings for {@link searchForTask}. Search is the registry's own hybrid
 * search, the same one `skills.search` answers with. The visitor allowance
 * has its own limiter, keyed by the client IP, which is never stored.
 */
export function taskSearchDeps(event: H3Event, platform: Platform): TaskSearchShellDeps {
  const config = (useRuntimeConfig(event).taskSearch ?? {}) as TaskSearchConfig
  const limiter = platform.env.TASK_SEARCH_RATE_LIMIT
  const ai = platform.ai as unknown as ModelBinding | undefined
  const budget = Number(config.dailyBudgetMicros)
  return {
    enabled: config.enabled !== false && config.enabled !== 'false',
    dailyBudgetMicros: Number.isFinite(budget) && budget >= 0 ? budget : 0,
    model: ai ? request => ai.run(TASK_SEARCH_MODEL, request) : undefined,
    search: async (query): Promise<TaskSearchSkill[]> => {
      const { items } = await querySkills(event, { search: query, limit: TASK_SEARCH_RESULTS_PER_QUERY, page: 1 })
      return items.map(skill => ({ ref: registrySkillKey(skill), description: skill.description, stars: skill.stars }))
    },
    // Global KV, not the per-colo Cache API, so an answer and the day's
    // spend are the same in every data center.
    storage: useStorage('cache'),
    allowVisitor: async () => {
      if (!limiter)
        return true
      const ip = getHeader(event, 'cf-connecting-ip') ?? 'unknown'
      const { success } = await limiter.limit({ key: `task-search:${ip}` })
      return success
    },
    schedule: promise => runAfterResponse(event, promise),
    digest: sha256Hex,
    now: () => Date.now(),
    report: emitReport,
  }
}
