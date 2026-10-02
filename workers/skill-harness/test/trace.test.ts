import { expect, it } from 'vitest'
import { createRunTrace } from '../runner/trace'

it('keeps recent bounded tool evidence from the failing phase', () => {
  const trace = createRunTrace()
  for (let step = 0; step < 150; step++)
    trace.record('repair', { _tag: 'ToolCall', step, toolName: 'bash', input: 'x'.repeat(1000) })
  const retained = trace.snapshot()
  expect(retained).toHaveLength(128)
  expect(retained[0]).toMatchObject({ phase: 'repair', step: 22 })
  expect(retained.at(-1)).toMatchObject({ step: 149, input: JSON.stringify('x'.repeat(1000)).slice(0, 350) })
})
