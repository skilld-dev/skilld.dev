import type { ProofResult } from '../src/contracts'

type Trace = NonNullable<ProofResult['trace']>
type Phase = Trace[number]['phase']
type Event = { _tag: 'StepStart', step: number } | { _tag: 'ToolCall', step: number, toolName: string, input: unknown } | { _tag: 'StepFinish', step: number, finishReason: string }

export function createRunTrace() {
  const events: Trace = []
  return {
    record(phase: Phase, event: Event): void {
      if (event._tag === 'StepStart')
        return
      events.push(event._tag === 'ToolCall'
        ? { _tag: 'ToolCall', phase, step: event.step, toolName: event.toolName.slice(0, 100), input: (JSON.stringify(event.input) ?? 'undefined').slice(0, 350) }
        : { _tag: 'StepFinish', phase, step: event.step, finishReason: event.finishReason.slice(0, 100) })
      if (events.length > 128)
        events.shift()
    },
    snapshot: (): Trace => [...events],
  }
}
