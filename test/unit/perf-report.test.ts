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

function countMeasurement(id: string, unit: string, headMin: number, parentMin: number) {
  return {
    harness: 1,
    benchmarks: [{
      id,
      kind: 'count',
      unit,
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

function countManifest(benchmark: { id: string, thresholdPercent?: number, direction?: string }) {
  return { benchmarks: [{ kind: 'count', ...benchmark }] }
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

describe('perf report count direction', () => {
  it('does not present a count fall past its threshold as an improvement', () => {
    const rules = readThresholds(countManifest({ id: 'client/chunk-count', thresholdPercent: 5, direction: 'either' }))
    const report = renderReport(countMeasurement('client/chunk-count', 'chunks', 78, 156), '', rules)
    expect(report).not.toContain('🟢')
    expect(report).toContain('⚠️ **`client/chunk-count` fell by 78 chunks (+50.00%)')
  })

  it('flags count growth the same way when the manifest marks both directions', () => {
    const rules = readThresholds(countManifest({ id: 'client/chunk-count', thresholdPercent: 5, direction: 'either' }))
    const report = renderReport(countMeasurement('client/chunk-count', 'chunks', 312, 156), '', rules)
    expect(report).not.toContain('🔴')
    expect(report).toContain('⚠️ **`client/chunk-count` grew by 156 chunks (+100.00%)')
  })

  it('still grades a byte fall past its threshold as an improvement', () => {
    const report = renderReport(countMeasurement('client/js-bytes', 'bytes', 50_000, 100_000), '', readThresholds(manifest(2)))
    expect(report).toContain('🟢 **`client/js-bytes` fell by')
  })

  it('refuses a direction the report does not know', () => {
    expect(() => readThresholds(countManifest({ id: 'client/chunk-count', direction: 'up' }))).toThrow('direction')
  })
})
