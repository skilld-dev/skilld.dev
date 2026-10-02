import type { ApiOperationHandler } from '../../shared/server/operation'
import { listOperations, skilldV1Protocol } from 'skilld-sdk/contract'
import { describe, expect, it } from 'vitest'

/**
 * Artifact delivery predates the public contract and keeps its own schemas
 * (ADR-0005). ADR-0006 lists folding it in as follow-up work.
 */
const OUTSIDE_CONTRACT = [
  /^layers\/artifact-delivery\//,
  /^server\/api\/v1\/openapi\.json\.get\.ts$/,
]

const modules = import.meta.glob<{ default: Partial<ApiOperationHandler> }>([
  '../../layers/*/server/api/v1/**/*.ts',
  '../../server/api/v1/**/*.ts',
  '!../../layers/artifact-delivery/**',
], { eager: true })

interface RouteFile {
  file: string
  route: string
  binding: ApiOperationHandler['skilldOperation'] | undefined
}

/** `layers/x/server/api/v1/a/[b]/index.get.ts` → `GET /api/v1/a/{b}` */
function routeOf(file: string): string {
  const match = file.match(/server\/api\/(v1\/.*)\.(get|post|put|patch|delete)\.ts$/)
  if (!match)
    return `UNROUTABLE ${file}`
  const path = `/api/${match[1]!}`
    .replace(/\/index$/, '')
    .replace(/\[([^\]]+)\]/g, '{$1}')
  return `${match[2]!.toUpperCase()} ${path}`
}

const routeFiles: RouteFile[] = Object.entries(modules)
  .map(([key, module]) => ({ file: key.replace(/^(\.\.\/)+/, ''), module }))
  .filter(({ file }) => !OUTSIDE_CONTRACT.some(pattern => pattern.test(file)))
  .map(({ file, module }) => ({ file, route: routeOf(file), binding: module.default?.skilldOperation }))

describe('public API route parity', () => {
  it('binds every route file under /api/v1 to an operation at its own path', () => {
    const mismatched = routeFiles
      .filter(({ route, binding }) => !binding || `${binding.method} ${binding.path}` !== route)
      .map(({ file, binding }) => `${file} → ${binding ? binding.id : 'no defineApiOperation'}`)
    expect(mismatched).toEqual([])
  })

  it('serves every operation from exactly one route file', () => {
    const counts = new Map<string, string[]>()
    for (const { file, binding } of routeFiles) {
      if (binding)
        counts.set(binding.id, [...(counts.get(binding.id) ?? []), file])
    }
    const problems = listOperations(skilldV1Protocol)
      .map(({ operation }) => ({ id: operation.id, files: counts.get(operation.id) ?? [] }))
      .filter(({ files }) => files.length !== 1)
      .map(({ id, files }) => `${id}: ${files.length === 0 ? 'no route' : files.join(', ')}`)
    expect(problems).toEqual([])
  })
})
