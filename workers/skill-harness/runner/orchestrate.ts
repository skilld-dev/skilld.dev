import type { ProofResult } from '../src/contracts'

type Success = Extract<ProofResult, { _tag: 'Ok' }>
type Report = Success['generation']
interface Candidate { outputDir: string, files: readonly { path: string, bytes: number }[], sourceAttempts: Success['sourceAttempts'] }
interface NativeReport { usage: { inputTokens?: number, cachedInputTokens?: number, outputTokens?: number }, steps: number, warnings: readonly string[] }
type Outcome<T> = ({ _tag: 'Ok', value: T } | { _tag: 'Err', error: unknown }) & { report?: NativeReport }
type RunnerResult = ProofResult extends infer Result ? Result extends { elapsedMs: number } ? Omit<Result, 'elapsedMs'> : never : never

const unavailableReport: Report = { _tag: 'Unavailable', reason: 'The runner did not receive a Harness usage report.', warnings: [] }

export function aggregateReports(reports: readonly (NativeReport | undefined)[]): Report {
  if (reports.length === 0 || reports.some(report => !report))
    return unavailableReport
  const available = reports.filter((report): report is NativeReport => report !== undefined)
  const count = (key: keyof NativeReport['usage']) => available.some(report => report.usage[key] === undefined) ? undefined : available.reduce((sum, report) => sum + report.usage[key]!, 0)
  return { _tag: 'Available', usage: { inputTokens: count('inputTokens'), cachedInputTokens: count('cachedInputTokens'), outputTokens: count('outputTokens') }, steps: available.reduce((sum, report) => sum + report.steps, 0), warnings: [...new Set(available.flatMap(report => [...report.warnings]))].slice(0, 512) }
}

export async function runGeneration(options: {
  generate: (findings: Success['review']['findings']) => Promise<Outcome<Candidate>>
  review: (candidate: Candidate) => Promise<Outcome<Success['review']>>
  readFiles: (candidate: Candidate) => Promise<Success['files']>
}): Promise<RunnerResult> {
  let findings: Success['review']['findings'] = []
  let previousCandidate: Candidate | undefined
  const generations: (NativeReport | undefined)[] = []
  const reviews: (NativeReport | undefined)[] = []
  for (const repairAttempts of [0, 1]) {
    const generation = await options.generate(findings)
    generations.push(generation.report)
    if (generation._tag === 'Err')
      return { _tag: 'Err', code: 'GENERATION_FAILED', detail: JSON.stringify(generation.error).slice(0, 8000), generation: aggregateReports(generations), reviewReport: reviews.length ? aggregateReports(reviews) : undefined, candidateFiles: previousCandidate ? await options.readFiles(previousCandidate) : undefined }
    previousCandidate = generation.value
    const checked = await options.review(generation.value)
    reviews.push(checked.report)
    if (checked._tag === 'Err')
      return { _tag: 'Err', code: 'REVIEW_FAILED', detail: JSON.stringify(checked.error).slice(0, 8000), generation: aggregateReports(generations), reviewReport: aggregateReports(reviews), candidateFiles: await options.readFiles(generation.value) }
    findings = checked.value.findings.filter(finding => finding.level === 'error')
    if (findings.length === 0) {
      return { _tag: 'Ok', files: await options.readFiles(generation.value), generation: aggregateReports(generations), reviewReport: aggregateReports(reviews), review: checked.value, sourceAttempts: generation.value.sourceAttempts, repairAttempts }
    }
    if (repairAttempts === 1) {
      return { _tag: 'Err', code: 'REVIEW_REJECTED', detail: JSON.stringify(checked.value).slice(0, 8000), generation: aggregateReports(generations), reviewReport: aggregateReports(reviews), review: checked.value, candidateFiles: await options.readFiles(generation.value), sourceAttempts: generation.value.sourceAttempts, repairAttempts }
    }
  }
  throw new Error('REPAIR_LIMIT_STATE_INVALID')
}
