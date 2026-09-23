// @vitest-environment node
import { describe, expect, it } from 'vitest'
// @ts-expect-error the perf harness is plain JavaScript, with no types
import { readThresholds, renderReport } from '../../scripts/perf/report.mjs'

function measurement(headMin: number, parentMin: number) {
  return {
    harness: 1,
    benchmarks: [{
      id: 'client/js-bytes',
      kind: 'count',
      unit: 'bytes',
      repeats: 1,
      head: { min: headMin, median: headMin },
      parent: { min: parentMin, median: parentMin },
      control: { min: headMin, median: headMin },
      deltaPercent: (headMin - parentMin) / parentMin * 100,
      controlPercent: 0,
      verified: true,
    }],
  }
}

function manifest(thresholdPercent?: unknown) {
  return {
    benchmarks: [{ id: 'client/js-bytes', kind: 'count', ...(thresholdPercent === undefined ? {} : { thresholdPercent }) }],
  }
}

describe('perf report thresholds', () => {
  it('calls count growth below its threshold no change, because feature work grows the bundle', () => {
    const report = renderReport(measurement(101_500, 100_000), '', readThresholds(manifest(2)))
    expect(report).toContain('✅ **No clear performance change.**')
  })

  it('calls count growth above its threshold a regression', () => {
    const report = renderReport(measurement(102_500, 100_000), '', readThresholds(manifest(2)))
    expect(report).toContain('🔴 **`client/js-bytes` grew by')
  })

  it('treats any count movement as a change when the manifest sets no threshold', () => {
    const report = renderReport(measurement(100_001, 100_000), '', readThresholds(manifest()))
    expect(report).toContain('🔴')
  })

  it('refuses a threshold that is not a non-negative number', () => {
    expect(() => readThresholds(manifest('2'))).toThrow('thresholdPercent')
    expect(() => readThresholds(manifest(-1))).toThrow('thresholdPercent')
  })
})
