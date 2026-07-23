interface ScheduledTriggerMetadata {
  scheduledAtMs: number | null
  triggerCron: string | null
  cfInvocationId: string | null
}

const triggerMetadata = new WeakMap<object, ScheduledTriggerMetadata>()

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function finiteNonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

export function recordScheduledTrigger(payload: unknown): void {
  if (!payload || typeof payload !== 'object')
    return
  const value = payload as Record<string, unknown>
  const context = value.context
  const controller = value.controller
  if (!context || typeof context !== 'object' || !controller || typeof controller !== 'object')
    return
  const parsedController = controller as Record<string, unknown>
  const parsedContext = context as Record<string, unknown>
  triggerMetadata.set(context, {
    scheduledAtMs: finiteNonNegative(parsedController.scheduledTime),
    triggerCron: nonEmptyString(parsedController.cron),
    cfInvocationId: nonEmptyString(parsedContext.invocationId),
  })
}

export function scheduledTriggerForTaskContext(context: unknown): ScheduledTriggerMetadata {
  if (!context || typeof context !== 'object')
    return { scheduledAtMs: null, triggerCron: null, cfInvocationId: null }
  const cloudflare = (context as Record<string, unknown>).cloudflare
  if (!cloudflare || typeof cloudflare !== 'object')
    return { scheduledAtMs: null, triggerCron: null, cfInvocationId: null }
  const executionContext = (cloudflare as Record<string, unknown>).context
  if (!executionContext || typeof executionContext !== 'object')
    return { scheduledAtMs: null, triggerCron: null, cfInvocationId: null }
  return triggerMetadata.get(executionContext)
    ?? { scheduledAtMs: null, triggerCron: null, cfInvocationId: null }
}
