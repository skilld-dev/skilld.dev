import type {
  EligibleEmbeddingRow,
  EmbeddingParityResult,
  EmbeddingParityVector,
} from '../layers/registry/server/utils/embedding-parity'
import { execFile as nodeExecFile } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  calculateEmbeddingParity,
  ELIGIBLE_EMBEDDINGS_SQL,
} from '../layers/registry/server/utils/embedding-parity'
import { vectorIdFor } from '../layers/registry/server/utils/vector-id'

export interface ExecFileResult {
  stdout: string
  stderr: string
}

export type ParityExecFile = (file: string, args: string[]) => Promise<ExecFileResult>

export interface RemoteParityCliDependencies {
  execFile: ParityExecFile
  wranglerPath?: string
}

export type RemoteParityCliResult
  = | {
    _tag: 'refused'
    reason: 'remote_dry_run_required' | 'remote_apply_required'
  }
  | {
    _tag: 'completed'
    parity: EmbeddingParityResult
    alarm: EmbeddingParityAlarm
  }
  | {
    _tag: 'repair_queued'
    parity: EmbeddingParityResult
    candidates: number
    markersInvalidated: number
  }
  | {
    _tag: 'orphan_cleanup_queued'
    parity: EmbeddingParityResult
    candidates: number
    deletionsQueued: number
    retainedAfterRecheck: number
  }

export type EmbeddingParityAlarm
  = | { _tag: 'clear' }
    | { _tag: 'triggered', missing: number, stale: number, orphan: number }

type RemoteParityCommand
  = | { _tag: 'audit', alarm: boolean }
    | { _tag: 'repair' }
    | { _tag: 'prune_orphans' }
    | {
      _tag: 'refused'
      reason: 'remote_dry_run_required' | 'remote_apply_required'
    }

interface ListVectorsPage {
  ids: string[]
  totalCount: number
  isTruncated: boolean
  nextCursor: string | null
}

const VECTOR_INDEX = 'skill-embeddings'
const VECTOR_READ_CHUNK = 20
const VECTOR_DELETE_CHUNK = 100

function parseJson(stdout: string, label: string): unknown {
  try {
    return JSON.parse(stdout) as unknown
  }
  catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Malformed ${label} JSON: ${detail}`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseD1Rows(stdout: string): EligibleEmbeddingRow[] {
  const value = parseJson(stdout, 'D1')
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])
    || value[0].success !== true || !Array.isArray(value[0].results)) {
    throw new Error('Malformed D1 JSON: expected one successful result set')
  }
  return value[0].results.map((candidate) => {
    if (!isRecord(candidate)
      || typeof candidate.owner !== 'string'
      || typeof candidate.repo !== 'string'
      || typeof candidate.name !== 'string'
      || typeof candidate.current_sha !== 'string'
      || (candidate.marker_sha !== null && typeof candidate.marker_sha !== 'string')) {
      throw new Error('Malformed D1 JSON: invalid eligible embedding row')
    }
    return {
      owner: candidate.owner,
      repo: candidate.repo,
      name: candidate.name,
      currentSha: candidate.current_sha,
      markerSha: candidate.marker_sha,
    }
  })
}

function parseListVectorsPage(stdout: string): ListVectorsPage {
  const value = parseJson(stdout, 'Vectorize list-vectors')
  if (!isRecord(value)
    || !Array.isArray(value.vectors)
    || !Number.isSafeInteger(value.count)
    || !Number.isSafeInteger(value.totalCount)
    || typeof value.isTruncated !== 'boolean'
    || (value.nextCursor !== undefined
      && value.nextCursor !== null
      && typeof value.nextCursor !== 'string')) {
    throw new Error('Malformed Vectorize list-vectors JSON: invalid page')
  }
  const ids = value.vectors.map((candidate) => {
    if (!isRecord(candidate) || typeof candidate.id !== 'string')
      throw new Error('Malformed Vectorize list-vectors JSON: invalid vector id')
    return candidate.id
  })
  if (value.count !== ids.length)
    throw new Error('Malformed Vectorize list-vectors JSON: count mismatch')
  if (value.isTruncated && !value.nextCursor)
    throw new Error('Malformed Vectorize list-vectors JSON: truncated page has no cursor')
  return {
    ids,
    totalCount: value.totalCount,
    isTruncated: value.isTruncated,
    nextCursor: typeof value.nextCursor === 'string' ? value.nextCursor : null,
  }
}

function parseCommand(args: string[]): RemoteParityCommand {
  const flags = new Set(args)
  const hasMutationFlag = flags.has('--repair')
    || flags.has('--prune-orphans')
    || flags.has('--apply')
  if (hasMutationFlag) {
    const exactRepair = args.length === 3
      && flags.has('--remote')
      && flags.has('--repair')
      && flags.has('--apply')
    if (exactRepair)
      return { _tag: 'repair' }
    const exactPrune = args.length === 3
      && flags.has('--remote')
      && flags.has('--prune-orphans')
      && flags.has('--apply')
    return exactPrune
      ? { _tag: 'prune_orphans' }
      : { _tag: 'refused', reason: 'remote_apply_required' }
  }
  const exactAudit = (args.length === 2 || args.length === 3)
    && flags.has('--remote')
    && flags.has('--dry-run')
    && (args.length === 2 || flags.has('--alarm'))
  return exactAudit
    ? { _tag: 'audit', alarm: flags.has('--alarm') }
    : { _tag: 'refused', reason: 'remote_dry_run_required' }
}

export function embeddingParityAlarm(parity: EmbeddingParityResult): EmbeddingParityAlarm {
  return parity.counts.missing > 0
    || parity.counts.stale > 0
    || parity.counts.orphan > 0
    ? {
        _tag: 'triggered',
        missing: parity.counts.missing,
        stale: parity.counts.stale,
        orphan: parity.counts.orphan,
      }
    : { _tag: 'clear' }
}

function parseGetVectors(result: ExecFileResult): EmbeddingParityVector[] {
  const start = result.stdout.indexOf('[')
  if (start < 0) {
    const output = `${result.stdout}\n${result.stderr}`
    if (output.includes('does not contain vectors corresponding'))
      return []
    throw new Error('Malformed Vectorize get-vectors output: JSON array missing')
  }
  const value = parseJson(result.stdout.slice(start), 'Vectorize get-vectors')
  if (!Array.isArray(value))
    throw new Error('Malformed Vectorize get-vectors JSON: expected array')
  return value.map((candidate) => {
    if (!isRecord(candidate) || typeof candidate.id !== 'string')
      throw new Error('Malformed Vectorize get-vectors JSON: invalid vector')
    const metadata = isRecord(candidate.metadata) ? candidate.metadata : undefined
    return { id: candidate.id, metadata }
  })
}

async function listAllVectorIds(
  execute: ParityExecFile,
  wranglerPath: string,
): Promise<string[]> {
  const ids: string[] = []
  const seenCursors = new Set<string>()
  let cursor: string | null = null
  let expectedTotal: number | null = null
  do {
    const args = [
      'vectorize',
      'list-vectors',
      VECTOR_INDEX,
      '--count',
      '1000',
      '--json',
      ...(cursor ? [`--cursor=${cursor}`] : []),
    ]
    const page = parseListVectorsPage((await execute(wranglerPath, args)).stdout)
    if (expectedTotal !== null && page.totalCount !== expectedTotal)
      throw new Error('Malformed Vectorize list-vectors JSON: totalCount changed during pagination')
    expectedTotal = page.totalCount
    ids.push(...page.ids)
    if (!page.isTruncated) {
      cursor = null
      continue
    }
    if (seenCursors.has(page.nextCursor!))
      throw new Error('Malformed Vectorize list-vectors JSON: cursor repeated')
    seenCursors.add(page.nextCursor!)
    cursor = page.nextCursor
  } while (cursor)

  if (ids.length !== expectedTotal)
    throw new Error(`Malformed Vectorize list-vectors JSON: expected ${expectedTotal} ids, received ${ids.length}`)
  return ids
}

async function getExpectedVectors(
  execute: ParityExecFile,
  wranglerPath: string,
  ids: string[],
): Promise<EmbeddingParityVector[]> {
  const vectors: EmbeddingParityVector[] = []
  for (let index = 0; index < ids.length; index += VECTOR_READ_CHUNK) {
    const chunk = ids.slice(index, index + VECTOR_READ_CHUNK)
    const result = await execute(wranglerPath, [
      'vectorize',
      'get-vectors',
      VECTOR_INDEX,
      '--ids',
      ...chunk,
    ])
    vectors.push(...parseGetVectors(result))
  }
  return vectors
}

function sqlString(value: string): string {
  return `'${value.replaceAll('\'', '\'\'')}'`
}

function parseMutationChanges(stdout: string): number {
  const value = parseJson(stdout, 'D1 repair')
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])
    || value[0].success !== true || !isRecord(value[0].meta)
    || !Number.isSafeInteger(value[0].meta.changes)) {
    throw new Error('Malformed D1 repair JSON: expected one successful mutation result')
  }
  return value[0].meta.changes as number
}

async function invalidateEmbeddingMarkers(
  execute: ParityExecFile,
  wranglerPath: string,
  rows: EligibleEmbeddingRow[],
): Promise<number> {
  const chunkSize = 50
  let changes = 0
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize)
    const values = chunk.map(row => `(
      ${sqlString(row.owner)},
      ${sqlString(row.repo)},
      ${sqlString(row.name)},
      ${sqlString(row.currentSha)}
    )`).join(',')
    const sql = `
      WITH candidates(owner, repo, name, content_sha) AS (VALUES ${values})
      DELETE FROM skill_generated AS marker
      WHERE marker.kind = 'embedding'
        AND EXISTS (
          SELECT 1
          FROM candidates
          WHERE marker.owner = candidates.owner
            AND marker.repo = candidates.repo
            AND marker.name = candidates.name
            AND marker.sha = candidates.content_sha
        )
    `
    const result = await execute(wranglerPath, [
      'd1',
      'execute',
      'DB',
      '--remote',
      '--command',
      sql,
      '--json',
    ])
    changes += parseMutationChanges(result.stdout)
  }
  return changes
}

async function deleteOrphanVectors(
  execute: ParityExecFile,
  wranglerPath: string,
  ids: string[],
): Promise<number> {
  let queued = 0
  for (let index = 0; index < ids.length; index += VECTOR_DELETE_CHUNK) {
    const chunk = ids.slice(index, index + VECTOR_DELETE_CHUNK)
    await execute(wranglerPath, [
      'vectorize',
      'delete-vectors',
      VECTOR_INDEX,
      ...chunk.map(id => `--ids=${id}`),
    ])
    queued += chunk.length
  }
  return queued
}

async function loadEligibleRows(
  execute: ParityExecFile,
  wranglerPath: string,
): Promise<EligibleEmbeddingRow[]> {
  const d1 = await execute(wranglerPath, [
    'd1',
    'execute',
    'DB',
    '--remote',
    '--command',
    ELIGIBLE_EMBEDDINGS_SQL,
    '--json',
  ])
  return parseD1Rows(d1.stdout)
}

export async function runRemoteEmbeddingParityCli(
  args: string[],
  deps: RemoteParityCliDependencies,
): Promise<RemoteParityCliResult> {
  const command = parseCommand(args)
  if (command._tag === 'refused')
    return command

  const wranglerPath = deps.wranglerPath ?? resolve(process.cwd(), 'node_modules/.bin/wrangler')
  const eligible = await loadEligibleRows(deps.execFile, wranglerPath)
  const inventoryIds = await listAllVectorIds(deps.execFile, wranglerPath)
  const identities = await Promise.all(eligible.map(async row => ({
    id: await vectorIdFor(row),
    row,
  })))
  const inventory = new Set(inventoryIds)
  const vectors = await getExpectedVectors(
    deps.execFile,
    wranglerPath,
    identities.filter(identity => inventory.has(identity.id)).map(identity => identity.id),
  )
  const parity = await calculateEmbeddingParity(eligible, vectors, inventoryIds)
  if (command._tag === 'audit') {
    return {
      _tag: 'completed',
      parity,
      alarm: embeddingParityAlarm(parity),
    }
  }
  if (command._tag === 'prune_orphans') {
    const freshEligible = await loadEligibleRows(deps.execFile, wranglerPath)
    const freshExpectedIds = new Set(
      await Promise.all(freshEligible.map(row => vectorIdFor(row))),
    )
    const deletableIds = parity.ids.orphan.filter(id => !freshExpectedIds.has(id))
    const deletionsQueued = await deleteOrphanVectors(
      deps.execFile,
      wranglerPath,
      deletableIds,
    )
    return {
      _tag: 'orphan_cleanup_queued',
      parity,
      candidates: parity.ids.orphan.length,
      deletionsQueued,
      retainedAfterRecheck: parity.ids.orphan.length - deletableIds.length,
    }
  }

  const repairIds = new Set([...parity.ids.missing, ...parity.ids.stale])
  const candidates = identities
    .filter(identity => repairIds.has(identity.id))
    .map(identity => identity.row)
  const markersInvalidated = await invalidateEmbeddingMarkers(
    deps.execFile,
    wranglerPath,
    candidates,
  )
  return {
    _tag: 'repair_queued',
    parity,
    candidates: candidates.length,
    markersInvalidated,
  }
}

const execFile: ParityExecFile = (file, args) => new Promise((resolvePromise, rejectPromise) => {
  nodeExecFile(file, args, { maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) {
      rejectPromise(new Error(`Wrangler command failed: ${error.message}`))
      return
    }
    resolvePromise({ stdout, stderr })
  })
})

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const result = await runRemoteEmbeddingParityCli(args, { execFile })
  if (result._tag === 'refused') {
    const requirement = result.reason === 'remote_apply_required'
      ? '--remote --repair --apply or --remote --prune-orphans --apply'
      : '--remote --dry-run'
    console.error(`Refused: embedding parity requires explicit ${requirement}`)
    process.exitCode = 2
    return
  }
  console.log(JSON.stringify(result, null, 2))
  if (result._tag === 'completed'
    && args.includes('--alarm')
    && result.alarm._tag === 'triggered') {
    process.exitCode = 1
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
