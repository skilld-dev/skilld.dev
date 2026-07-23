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
  = | { _tag: 'refused', reason: 'remote_dry_run_required' }
    | { _tag: 'completed', parity: EmbeddingParityResult }

interface ListVectorsPage {
  ids: string[]
  totalCount: number
  isTruncated: boolean
  nextCursor: string | null
}

const VECTOR_INDEX = 'skill-embeddings'
const VECTOR_READ_CHUNK = 100

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
    || (value.nextCursor !== null && typeof value.nextCursor !== 'string')) {
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
    nextCursor: value.nextCursor,
  }
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
      ...(cursor ? ['--cursor', cursor] : []),
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

export async function runRemoteEmbeddingParityCli(
  args: string[],
  deps: RemoteParityCliDependencies,
): Promise<RemoteParityCliResult> {
  const exactFlags = args.length === 2
    && args.includes('--remote')
    && args.includes('--dry-run')
  if (!exactFlags)
    return { _tag: 'refused', reason: 'remote_dry_run_required' }

  const wranglerPath = deps.wranglerPath ?? resolve(process.cwd(), 'node_modules/.bin/wrangler')
  const d1 = await deps.execFile(wranglerPath, [
    'd1',
    'execute',
    'DB',
    '--remote',
    '--command',
    ELIGIBLE_EMBEDDINGS_SQL,
    '--json',
  ])
  const eligible = parseD1Rows(d1.stdout)
  const inventoryIds = await listAllVectorIds(deps.execFile, wranglerPath)
  const expectedIds = await Promise.all(eligible.map(row => vectorIdFor(row)))
  const vectors = await getExpectedVectors(deps.execFile, wranglerPath, expectedIds)
  return {
    _tag: 'completed',
    parity: await calculateEmbeddingParity(eligible, vectors, inventoryIds),
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
  const result = await runRemoteEmbeddingParityCli(process.argv.slice(2), { execFile })
  if (result._tag === 'refused') {
    console.error('Refused: embedding parity requires explicit --remote --dry-run')
    process.exitCode = 2
    return
  }
  console.log(JSON.stringify(result.parity, null, 2))
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
