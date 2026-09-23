#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

// Renders one measurement as the pull request comment.
//
// The gate is measured, not assumed. Every benchmark carries the delta the
// same build produced against itself in the same job, so a reading counts only
// when it beats that noise by a margin. A count benchmark has no noise at all.
// It counts only above the `thresholdPercent` perf/benchmarks.json declares for
// it, because a site's bundle grows a little with most feature commits.
const TIME_FLOOR_PERCENT = 5
const NOISE_MARGIN = 2

function formatBytes(bytes) {
  const absolute = Math.abs(bytes)
  if (absolute >= 1024 * 1024)
    return `${(bytes / 1024 ** 2).toFixed(2)} MiB`
  if (absolute >= 1024)
    return `${(bytes / 1024).toFixed(1)} KiB`
  return `${bytes} B`
}

function formatValue(benchmark, value) {
  if (benchmark.unit === 'bytes')
    return formatBytes(value)
  if (benchmark.unit === 'ms')
    return `${value.toFixed(2)} ms`
  return `${value} ${benchmark.unit}`
}

function formatPercent(percent) {
  if (percent === null)
    return '—'
  return `${percent > 0 ? '+' : ''}${percent.toFixed(2)}%`
}

function escapeCell(value) {
  return String(value).replaceAll('|', '&#124;').replace(/[\r\n]+/g, ' ')
}

/** The delta a benchmark must beat before anyone calls it a change. */
function gatePercent(benchmark, thresholds) {
  if (benchmark.kind === 'count')
    return thresholds[benchmark.id] ?? 0
  const noise = Math.abs(benchmark.controlPercent ?? 0) * NOISE_MARGIN
  return Math.max(TIME_FLOOR_PERCENT, noise)
}

function classify(benchmark, rules) {
  const delta = benchmark.deltaPercent
  if (delta === null || !benchmark.verified)
    return { ...benchmark, _tag: 'Unusable' }
  const gate = gatePercent(benchmark, rules.thresholds)
  if (Math.abs(delta) <= gate)
    return { ...benchmark, _tag: 'Unchanged', gate }
  // A count the manifest marks `direction: either` is suspect both ways: a
  // lost code split moves a chunk count down, a page of tiny requests moves
  // it up. The report cannot grade it, so it flags it for a read instead.
  if (rules.directions[benchmark.id] === 'either')
    return { ...benchmark, _tag: 'Changed', gate }
  return { ...benchmark, _tag: delta > 0 ? 'Slower' : 'Faster', gate }
}

function subject(row) {
  const amount = formatValue(row, Math.abs(row.head.min - row.parent.min))
  const verb = row.deltaPercent > 0 ? 'grew' : 'fell'
  return `\`${escapeCell(row.id)}\` ${verb} by ${amount} (${formatPercent(Math.abs(row.deltaPercent))})`
}

function renderOutcome(rows) {
  const unusable = rows.filter(row => row._tag === 'Unusable')
  const changed = rows.filter(row => row._tag === 'Changed')
  const slower = rows.filter(row => row._tag === 'Slower')
  const faster = rows.filter(row => row._tag === 'Faster')
  if (unusable.length)
    return `⚠️ **${unusable.length} benchmark${unusable.length === 1 ? '' : 's'} produced no usable reading.** The two sides disagreed on their output, or the case failed.`
  if (changed.length) {
    const head = changed.length === 1
      ? subject(changed[0])
      : `${changed.length} benchmarks moved past their threshold`
    const why = changed.length === 1
      ? 'The manifest marks this count as suspect in both directions, so read the build before you grade the movement.'
      : `The manifest marks these ${changed.length} counts as suspect in both directions, so read the build before you grade the movement.`
    const rest = slower.length || faster.length
      ? ` The same run marks ${slower.length} slower and ${faster.length} faster, past the noise this run measured.`
      : ''
    return `⚠️ **${head}. ${why}${rest}**`
  }
  if (slower.length === 1 && faster.length === 0)
    return `🔴 **${subject(slower[0])}.**`
  if (faster.length === 1 && slower.length === 0)
    return `🟢 **${subject(faster[0])}.**`
  if (slower.length)
    return `⚠️ **${slower.length} slower and ${faster.length} faster, past the noise this run measured.**`
  if (faster.length)
    return `🟢 **${faster.length} benchmark${faster.length === 1 ? '' : 's'} improved past the noise this run measured.**`
  return '✅ **No clear performance change.**'
}

function renderTable(rows) {
  const output = [
    '| Benchmark | Base | This PR | Change | Noise |',
    '|---|---:|---:|---:|---:|',
  ]
  for (const row of rows) {
    const mark = row._tag === 'Slower' ? '🔴 ' : row._tag === 'Faster' ? '🟢 ' : row._tag === 'Changed' ? '⚠️ ' : ''
    const change = row._tag === 'Unusable' ? '—' : `${mark}${formatPercent(row.deltaPercent)}`
    output.push(`| \`${escapeCell(row.id)}\` | ${formatValue(row, row.parent.min)} | ${formatValue(row, row.head.min)} | ${change} | ${formatPercent(row.controlPercent)} |`)
  }
  return output
}

function renderHowToRead(rows) {
  const counts = rows.filter(row => row.kind === 'count').length
  return [
    '<details><summary>How to read this</summary>',
    '',
    'Both revisions are built and measured in one job, on one machine, alternating within seconds. Machine class, CPU model, and noisy neighbours hit both sides equally, so they cancel in the change column.',
    '',
    '**Noise** is this run marking its own homework. It is the same build measured a second time against itself, so it should be zero and never is. A change counts only when it clears twice the noise, or 5%, whichever is larger.',
    '',
    counts > 0
      ? `A \`count\` benchmark carries no noise at all, so any movement there is real. It counts as a change only above the threshold \`perf/benchmarks.json\` declares for it, because most feature work grows the bundle a little. A count marked \`direction: either\` is suspect in both directions, so ⚠️ flags it for a read. ${counts} of ${rows.length} here ${counts === 1 ? 'is' : 'are'} a count.`
      : 'Every benchmark here is timed, so every reading carries noise.',
    '',
    'Values are the fastest of the repeats. The minimum leads, because noise only ever adds.',
    '',
    '</details>',
  ]
}

/**
 * Reads each count Benchmark's rules from the manifest: the `thresholdPercent`
 * a change must clear, and the `direction` when movement in both directions
 * is suspect. A Measurement carries neither. The manifest of the revision
 * under review decides, the same one whose cases took the samples.
 *
 * A count without `direction: either` keeps the default grading, where a fall
 * past the gate is an improvement and growth past it is a regression.
 */
export function readThresholds(manifest) {
  const thresholds = {}
  const directions = {}
  for (const benchmark of manifest.benchmarks ?? []) {
    if (benchmark.thresholdPercent !== undefined) {
      if (typeof benchmark.thresholdPercent !== 'number' || !(benchmark.thresholdPercent >= 0))
        throw new TypeError(`${benchmark.id}: thresholdPercent must be a number of 0 or more.`)
      thresholds[benchmark.id] = benchmark.thresholdPercent
    }
    if (benchmark.direction !== undefined) {
      if (benchmark.direction !== 'either')
        throw new TypeError(`${benchmark.id}: direction must be "either", or left out for the default grading.`)
      directions[benchmark.id] = benchmark.direction
    }
  }
  return { thresholds, directions }
}

export function renderReport(measurement, baseLabel = '', rules = {}) {
  const { thresholds = {}, directions = {} } = rules
  const rows = (measurement.benchmarks ?? []).map(benchmark => classify(benchmark, { thresholds, directions }))
  const output = ['### ⚡ Perf', '', renderOutcome(rows), '']
  if (rows.length)
    output.push(...renderTable(rows), '', ...renderHowToRead(rows))
  else
    output.push('No benchmark produced a reading.')
  if (measurement.dependenciesChanged === true)
    output.push('', '> ℹ️ This pull request changes `pnpm-lock.yaml`. Each side still builds from its own lockfile, so the comparison holds. A change above may belong to a dependency rather than to this repository.')
  if (baseLabel)
    output.push('', `<sub>Base: ${escapeCell(baseLabel)}. Both sides ran on the same runner, ${measurement.repeats ?? rows[0]?.repeats ?? 'several'} repeats each.</sub>`)
  return `${output.join('\n')}\n`
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const path = process.env.MEASUREMENT
  if (!path || !existsSync(path))
    throw new TypeError('MEASUREMENT must point to a measurement produced by scripts/perf/run.mjs.')
  const manifest = JSON.parse(readFileSync(resolve(process.env.MANIFEST ?? 'perf/benchmarks.json'), 'utf8'))
  process.stdout.write(renderReport(JSON.parse(readFileSync(path, 'utf8')), process.env.BASE_LABEL, readThresholds(manifest)))
}
