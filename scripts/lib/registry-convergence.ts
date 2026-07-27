import { ABSTRACTNESS_PROMPT_VERSION } from '../../layers/registry/server/utils/ai-generation-work'

export interface ConvergenceMetric {
  total: number
  current: number
  remaining: number
}

export interface RegistryConvergenceSnapshot {
  sourceIdentity: ConvergenceMetric
  historicalDiscovery: ConvergenceMetric
  abstractnessV3: ConvergenceMetric
}

export type RegistryConvergenceKey = keyof RegistryConvergenceSnapshot

export type RegistryConvergenceParseResult
  = | { _tag: 'ok', snapshot: RegistryConvergenceSnapshot }
    | { _tag: 'error', reason: 'malformed_d1_output' }

export type RegistryConvergenceSummary
  = | {
    _tag: 'complete'
    complete: RegistryConvergenceKey[]
    incomplete: []
  }
  | {
    _tag: 'converging'
    complete: RegistryConvergenceKey[]
    incomplete: RegistryConvergenceKey[]
  }

export const REGISTRY_CONVERGENCE_SQL = `
  SELECT
    COUNT(*) AS total_repos,
    SUM(CASE
      WHEN source_owner IS NOT NULL AND source_repo IS NOT NULL THEN 1
      ELSE 0
    END) AS source_identified
  FROM repos r
  WHERE r.broken_since IS NULL
    AND EXISTS (
      SELECT 1 FROM skills s
      WHERE s.owner = r.owner AND s.repo = r.repo
    );

  SELECT COUNT(*) AS historical_staged
  FROM discovery_candidates
  WHERE source = 'historical_inventory';

  SELECT COUNT(*) AS historical_unstaged
  FROM repos r
  WHERE r.broken_since IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM skills s
      WHERE s.owner = r.owner AND s.repo = r.repo
    )
    AND NOT EXISTS (
      SELECT 1 FROM discovery_candidates dc
      WHERE dc.owner = r.owner AND dc.repo = r.repo
    );

  SELECT
    COUNT(*) AS eligible,
    SUM(CASE
      WHEN EXISTS (
        SELECT 1
        FROM skill_generated g
        WHERE g.owner = s.owner
          AND g.repo = s.repo
          AND g.name = s.name
          AND g.kind = 'abstractness'
          AND g.sha = s.current_sha
          AND json_extract(g.payload, '$.promptVersion') = '${ABSTRACTNESS_PROMPT_VERSION}'
      ) THEN 1
      ELSE 0
    END) AS classifier_v3
  FROM skills s
  JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
  WHERE r.broken_since IS NULL
    AND s.current_sha IS NOT NULL
    AND s.rendered_raw IS NOT NULL
    AND s.rendered_status = 'ok'
    AND s.seo_indexable = 1;
`

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function resultRow(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)
    || value.success !== true
    || !Array.isArray(value.results)
    || value.results.length !== 1
    || !isRecord(value.results[0])) {
    return null
  }
  return value.results[0]
}

function nonNegativeInteger(record: Record<string, unknown>, key: string): number | null {
  const value = record[key]
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  }
  catch {
    // Malformed CLI output is represented by the tagged parse error.
    return null
  }
}

export function parseRegistryConvergence(stdout: string): RegistryConvergenceParseResult {
  const value = parseJson(stdout)
  if (!Array.isArray(value) || value.length !== 4)
    return { _tag: 'error', reason: 'malformed_d1_output' }

  const source = resultRow(value[0])
  const staged = resultRow(value[1])
  const unstaged = resultRow(value[2])
  const abstractness = resultRow(value[3])
  if (!source || !staged || !unstaged || !abstractness)
    return { _tag: 'error', reason: 'malformed_d1_output' }

  const sourceTotal = nonNegativeInteger(source, 'total_repos')
  const sourceCurrent = nonNegativeInteger(source, 'source_identified')
  const historicalCurrent = nonNegativeInteger(staged, 'historical_staged')
  const historicalRemaining = nonNegativeInteger(unstaged, 'historical_unstaged')
  const abstractnessTotal = nonNegativeInteger(abstractness, 'eligible')
  const abstractnessCurrent = nonNegativeInteger(abstractness, 'classifier_v3')
  if (sourceTotal === null
    || sourceCurrent === null
    || sourceCurrent > sourceTotal
    || historicalCurrent === null
    || historicalRemaining === null
    || abstractnessTotal === null
    || abstractnessCurrent === null
    || abstractnessCurrent > abstractnessTotal) {
    return { _tag: 'error', reason: 'malformed_d1_output' }
  }

  return {
    _tag: 'ok',
    snapshot: {
      sourceIdentity: {
        total: sourceTotal,
        current: sourceCurrent,
        remaining: sourceTotal - sourceCurrent,
      },
      historicalDiscovery: {
        total: historicalCurrent + historicalRemaining,
        current: historicalCurrent,
        remaining: historicalRemaining,
      },
      abstractnessV3: {
        total: abstractnessTotal,
        current: abstractnessCurrent,
        remaining: abstractnessTotal - abstractnessCurrent,
      },
    },
  }
}

export function registryConvergenceSummary(
  snapshot: RegistryConvergenceSnapshot,
): RegistryConvergenceSummary {
  const entries = Object.entries(snapshot) as Array<
    [RegistryConvergenceKey, ConvergenceMetric]
  >
  const complete = entries
    .filter(([, metric]) => metric.remaining === 0)
    .map(([key]) => key)
  const incomplete = entries
    .filter(([, metric]) => metric.remaining > 0)
    .map(([key]) => key)
  return incomplete.length
    ? { _tag: 'converging', complete, incomplete }
    : { _tag: 'complete', complete, incomplete: [] }
}
