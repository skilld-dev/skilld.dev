import type { ProofResult } from '../src/contracts'

type Success = Extract<ProofResult, { _tag: 'Ok' }>
type Report = Success['generation']
interface Candidate { outputDir: string, files: readonly { path: string, bytes: number }[], warnings: readonly string[], sourceAttempts: Success['sourceAttempts'] }
type Outcome<T> = { _tag: 'Ok', value: T } | { _tag: 'Err', error: unknown }
type RunnerResult = ProofResult extends infer Result ? Result extends { elapsedMs: number } ? Omit<Result, 'elapsedMs'> : never : never

const unavailableReport: Report = { _tag: 'Unavailable', reason: 'skilld-harness@3.2.0 does not return usage reports.', warnings: [] }

function generationReport(generation: Outcome<Candidate>): Report {
  return { ...unavailableReport, warnings: generation._tag === 'Ok' ? [...generation.value.warnings] : [] }
}

export async function runGeneration(options: {
  generate: (findings: Success['review']['findings']) => Promise<Outcome<Candidate>>
  review: (candidate: Candidate) => Promise<Outcome<Success['review']>>
  readFiles: (candidate: Candidate) => Promise<Success['files']>
}): Promise<RunnerResult> {
  let findings: Success['review']['findings'] = []
  for (const repairAttempts of [0, 1]) {
    const generation = await options.generate(findings)
    if (generation._tag === 'Err')
      return { _tag: 'Err', code: 'GENERATION_FAILED', detail: JSON.stringify(generation.error), generation: generationReport(generation) }
    const checked = await options.review(generation.value)
    if (checked._tag === 'Err')
      return { _tag: 'Err', code: 'REVIEW_FAILED', detail: JSON.stringify(checked.error), generation: generationReport(generation), reviewReport: unavailableReport }
    findings = checked.value.findings.filter(finding => finding.level === 'error')
    if (findings.length === 0) {
      return { _tag: 'Ok', files: await options.readFiles(generation.value), generation: generationReport(generation), reviewReport: unavailableReport, review: checked.value, sourceAttempts: generation.value.sourceAttempts, repairAttempts }
    }
    if (repairAttempts === 1) {
      return { _tag: 'Err', code: 'REVIEW_REJECTED', detail: JSON.stringify(checked.value), generation: generationReport(generation), reviewReport: unavailableReport, review: checked.value, candidateFiles: await options.readFiles(generation.value), sourceAttempts: generation.value.sourceAttempts, repairAttempts }
    }
  }
  throw new Error('REPAIR_LIMIT_STATE_INVALID')
}
