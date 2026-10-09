import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

interface Measurement {
  repository: string
  name: string
  included: boolean
  rawSha256: string
  descriptionSha256: string
  normalizedDescriptionSha256: string
  descriptionCharacters: number
  skillBytes: number | null
  bodyTokens: number | null
  bodyLines: number | null
  referenceFiles: number | null
  assessment: 'clear' | 'needs-work' | 'uncertain' | null
  topic: string | null
}

const directory = fileURLToPath(new URL('../../public/research/skill-md-size-2026-10-09/', import.meta.url))
const source = readFileSync(`${directory}measurements.json`, 'utf8')
const rows: Measurement[] = JSON.parse(source)
const included = rows.filter(row => row.included)
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
function quantile(values: number[], probability: number) {
  const sorted = values.toSorted((a, b) => a - b)
  return sorted.length ? sorted[Math.ceil(sorted.length * probability) - 1]! : null
}
const numeric = (values: (number | null)[]) => values.filter((value): value is number => value !== null)
const unique = (values: Measurement[], key: (row: Measurement) => string) => [...new Map(values.map(row => [key(row), row])).values()]
function grouped(values: Measurement[]) {
  const groups = new Map<string, Measurement[]>()
  for (const row of values) {
    const group = groups.get(row.repository) ?? []
    group.push(row)
    groups.set(row.repository, group)
  }
  return [...groups.values()]
}
function stats(values: Measurement[]) {
  const lengths = values.map(row => row.descriptionCharacters)
  const tokens = numeric(values.map(row => row.bodyTokens))
  const bytes = numeric(values.map(row => row.skillBytes))
  const references = numeric(values.map(row => row.referenceFiles))
  const assessments = values.filter(row => row.assessment !== null)
  return {
    skills: values.length,
    repositories: grouped(values).length,
    descriptionMean: mean(lengths),
    descriptionMedian: quantile(lengths, 0.5),
    descriptionP90: quantile(lengths, 0.9),
    descriptionP95: quantile(lengths, 0.95),
    descriptionOver1024: lengths.filter(n => n > 1024).length,
    fileMeanKB: mean(bytes.map(n => n / 1000)),
    fileMedianKB: quantile(bytes.map(n => n / 1000), 0.5),
    fileP90KB: quantile(bytes.map(n => n / 1000), 0.9),
    bodyMeasured: tokens.length,
    bodyMean: mean(tokens),
    bodyMedian: quantile(tokens, 0.5),
    bodyP90: quantile(tokens, 0.9),
    bodyP95: quantile(tokens, 0.95),
    bodyAtLeast5000: tokens.filter(n => n >= 5000).length,
    bodyAtLeast5000Percent: mean(tokens.map(n => n >= 5000 ? 100 : 0)),
    bodyAtLeast500Lines: numeric(values.map(row => row.bodyLines)).filter(n => n >= 500).length,
    referenceMeasured: references.length,
    referenceMean: mean(references),
    referenceMedian: quantile(references, 0.5),
    assessmentClearPercent: mean(assessments.map(row => row.assessment === 'clear' ? 100 : 0)),
  }
}
const groups = grouped(included)
const bodyGroups = groups.filter(group => group.some(row => row.bodyTokens !== null))
const bounds = [0, 100, 200, 400, 600, 1000, Infinity]
const summary = {
  snapshot: '2026-10-09-v1',
  measurementsSha256: createHash('sha256').update(source).digest('hex'),
  all: stats(rows),
  excluded: stats(rows.filter(row => !row.included)),
  included: stats(included),
  uniqueDescriptions: stats(unique(included, row => row.normalizedDescriptionSha256)),
  uniqueSourceFiles: stats(unique(included, row => row.rawSha256)),
  repositoryWeighted: {
    repositories: groups.length,
    descriptionMean: mean(numeric(groups.map(group => mean(group.map(row => row.descriptionCharacters))))),
    bodyRepositories: bodyGroups.length,
    bodyMean: mean(numeric(bodyGroups.map(group => mean(numeric(group.map(row => row.bodyTokens)))))),
    bodyAtLeast5000Percent: mean(numeric(bodyGroups.map(group => mean(numeric(group.map(row => row.bodyTokens)).map(n => n >= 5000 ? 100 : 0))))),
  },
  topics: ['coding', 'writing', 'design', 'operations', 'data', 'planning', 'security', 'research', 'other', 'unclear'].map((topic) => {
    const values = included.filter(row => row.topic === topic)
    return { topic, ...stats(values), bands: {
      green: values.filter(row => row.bodyTokens !== null && row.bodyTokens <= 2500).length,
      amber: values.filter(row => row.bodyTokens !== null && row.bodyTokens > 2500 && row.bodyTokens < 5000).length,
      red: values.filter(row => row.bodyTokens !== null && row.bodyTokens >= 5000).length,
      missing: values.filter(row => row.bodyTokens === null).length,
    } }
  }),
  descriptionBands: bounds.slice(0, -1).map((min, index) => {
    const max = bounds[index + 1]!
    const values = included.filter(row => row.descriptionCharacters >= min && row.descriptionCharacters < max)
    return { min, max: Number.isFinite(max) ? max - 1 : null, total: values.length, clear: values.filter(row => row.assessment === 'clear').length, uncertain: values.filter(row => row.assessment === 'uncertain').length, needsWork: values.filter(row => row.assessment === 'needs-work').length }
  }),
}
writeFileSync(`${directory}summary.json`, `${JSON.stringify(summary, null, 2)}\n`)
console.log(JSON.stringify({ included: summary.included, repositoryWeighted: summary.repositoryWeighted, uniqueDescriptions: summary.uniqueDescriptions, uniqueSourceFiles: summary.uniqueSourceFiles, excluded: summary.excluded }, null, 2))
