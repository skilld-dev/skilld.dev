import type { EventHandler, EventHandlerRequest, H3Event } from 'h3'
import type {
  OperationParsedInput,
  OperationResult,
  SkilldV1ErrorCode,
  SkilldV1OperationDefinition,
  SkilldV1Problem,
} from 'skilld-sdk/contract'
import type { z } from 'zod'
import type { UserSession } from './handler'
import type { Platform } from './platform'
import { defineEventHandler, getQuery, getRouterParams, setHeader, setResponseStatus } from 'h3'
import {
  problemSchema,
  problemType,
  SKILLD_V1_ERROR_CODES,
  SKILLD_V1_ERROR_STATUS,
  SKILLD_V1_ERROR_TITLES,
  SKILLD_V1_IMPLICIT_ERRORS,
  SKILLD_V1_RESPONSE_HEADERS,
} from 'skilld-sdk/contract'
import { readApiBody, resolveRequestUser } from './handler'

export type AccountUser = UserSession['user']

/** An expected failure, returned as a value so the handler's signature shows it. */
export interface OperationFailure<TCode extends SkilldV1ErrorCode = SkilldV1ErrorCode> {
  _tag: 'OperationFailure'
  code: TCode
  detail?: string
}

export function operationFailure<const TCode extends SkilldV1ErrorCode>(code: TCode, detail?: string): OperationFailure<TCode> {
  return { _tag: 'OperationFailure', code, detail }
}

export interface OperationCtx<TOperation extends SkilldV1OperationDefinition> {
  event: H3Event
  platform: Platform
  input: OperationParsedInput<TOperation>
  /** Always set on an `account` operation. Never read on a `public` one, so a shared cache can hold its answer. */
  user: TOperation['access'] extends 'account' ? AccountUser : null
}

type DeclaredFailure<TOperation extends SkilldV1OperationDefinition> = OperationFailure<TOperation['errors'][number]>

export interface ApiOperationOptions<TOperation extends SkilldV1OperationDefinition> {
  operation: TOperation
  handler: (ctx: OperationCtx<TOperation>) => Promise<OperationResult<TOperation> | DeclaredFailure<TOperation>> | OperationResult<TOperation> | DeclaredFailure<TOperation>
}

export interface OperationBinding {
  id: string
  method: string
  path: string
}

export type ApiOperationHandler = EventHandler<EventHandlerRequest, Promise<unknown>> & { skilldOperation: OperationBinding }

/**
 * The one shape of a `/api/v1` route in the public contract.
 *
 * The descriptor decides everything a route used to decide for itself: how
 * each request location parses, whether a credential is needed, the success
 * status, the cache policy, and the exact response shape. The handler only
 * loads data. Its answer passes through the producer schema, which rejects any
 * field the contract does not name, so the server cannot leak a field a strict
 * client would refuse. A failed check answers 500 instead of a wrong body.
 *
 * Every failure answers RFC 9457 `application/problem+json`, the shape the
 * skilld CLI already parses for Artifact delivery.
 */
export function defineApiOperation<const TOperation extends SkilldV1OperationDefinition>(
  options: ApiOperationOptions<TOperation>,
): ApiOperationHandler {
  const { operation } = options
  const handler = defineEventHandler(async (event) => {
    const platform = event.context.platform
    if (!platform)
      throw new Error('platform context missing: server/plugins/platform.ts not loaded')
    setHeader(event, SKILLD_V1_RESPONSE_HEADERS.requestId, platform.requestId)
    setHeader(event, SKILLD_V1_RESPONSE_HEADERS.operation, operation.id)
    if (operation.lifecycle.deprecated)
      setHeader(event, SKILLD_V1_RESPONSE_HEADERS.deprecation, `@${Math.floor(Date.parse(operation.lifecycle.deprecated.at) / 1000)}`)

    const outcome = await runOperation(event, platform, options)
      .catch((error: unknown) => failureFromThrown(operation, error))
    if (outcome._tag === 'OperationFailure')
      return sendProblem(event, operation, outcome)

    if (operation.response.body === null) {
      setCacheHeaders(event, operation)
      setResponseStatus(event, 204)
      return null
    }
    const parsed = operation.response.body.producer.safeParse(outcome.value)
    if (!parsed.success) {
      emitOperationalEvent(createWideEvent({
        'operation': 'api-v1-contract',
        'outcome': 'failed',
        'api.operation': operation.id,
        'reason': summarizeIssues('response', parsed.error.issues),
      }), 'error')
      return sendProblem(event, operation, operationFailure('INTERNAL_ERROR'))
    }
    setCacheHeaders(event, operation)
    setResponseStatus(event, operation.response.status)
    return parsed.data
  }) as ApiOperationHandler
  handler.skilldOperation = { id: operation.id, method: operation.method, path: operation.path }
  return handler
}

async function runOperation<TOperation extends SkilldV1OperationDefinition>(
  event: H3Event,
  platform: Platform,
  options: ApiOperationOptions<TOperation>,
): Promise<{ _tag: 'Ok', value: unknown } | OperationFailure> {
  const { operation } = options
  const input = await parseInput(event, operation)
  if (input._tag === 'OperationFailure')
    return input

  let user: AccountUser | null = null
  if (operation.access === 'account') {
    user = await resolveRequestUser(event)
    if (!user)
      return operationFailure('AUTH_REQUIRED', 'Sign in with `skilld auth login`, or send a skilld token as a Bearer credential.')
  }

  const result = await options.handler({
    event,
    platform,
    input: input.value as OperationParsedInput<TOperation>,
    user: user as OperationCtx<TOperation>['user'],
  })
  if (isOperationFailure(result))
    return result
  return { _tag: 'Ok', value: result }
}

async function parseInput(
  event: H3Event,
  operation: SkilldV1OperationDefinition,
): Promise<{ _tag: 'Ok', value: Record<'params' | 'query' | 'body', unknown> } | OperationFailure> {
  const sources = {
    params: () => getRouterParams(event, { decode: true }),
    query: () => getQuery(event),
    body: () => readApiBody(event),
  }
  const value: Record<'params' | 'query' | 'body', unknown> = { params: undefined, query: undefined, body: undefined }
  for (const location of ['params', 'query', 'body'] as const) {
    const schema = operation.request[location]
    if (!schema)
      continue
    const raw = await sources[location]()
    const parsed = (schema as z.ZodTypeAny).safeParse(location === 'body' ? raw ?? undefined : raw)
    if (!parsed.success)
      return operationFailure('INVALID_REQUEST', summarizeIssues(location, parsed.error.issues))
    value[location] = parsed.data
  }
  return { _tag: 'Ok', value }
}

function isOperationFailure(value: unknown): value is OperationFailure {
  return typeof value === 'object' && value !== null && (value as { _tag?: unknown })._tag === 'OperationFailure'
}

function summarizeIssues(location: string, issues: readonly z.core.$ZodIssue[]): string {
  return issues.slice(0, 3)
    .map(issue => `${[location, ...issue.path.map(String)].join('.')}: ${issue.message}`)
    .join('; ')
    .slice(0, 1000)
}

const STATUS_CODES: Readonly<Record<number, SkilldV1ErrorCode>> = Object.fromEntries(
  SKILLD_V1_ERROR_CODES.map(code => [SKILLD_V1_ERROR_STATUS[code], code]),
)

/**
 * Shared utilities still throw h3 errors. Map the status they carry onto a
 * contract code, and keep the message only for a client error, where it
 * explains the request. A server error's message stays in the log.
 */
function failureFromThrown(operation: SkilldV1OperationDefinition, error: unknown): OperationFailure {
  const record = typeof error === 'object' && error !== null ? error as Record<string, unknown> : {}
  const status = typeof record.statusCode === 'number' ? record.statusCode : 500
  const code = STATUS_CODES[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST')
  if (status >= 500) {
    emitOperationalEvent(createWideEvent({
      'operation': 'api-v1-handler',
      'outcome': 'failed',
      'api.operation': operation.id,
      'reason': error instanceof Error ? error.message : String(error),
    }), 'error')
    return operationFailure(code)
  }
  const message = typeof record.message === 'string' ? record.message : undefined
  return operationFailure(code, message)
}

function sendProblem(event: H3Event, operation: SkilldV1OperationDefinition, failure: OperationFailure): SkilldV1Problem {
  const declared = new Set<SkilldV1ErrorCode>([...operation.errors, ...SKILLD_V1_IMPLICIT_ERRORS])
  let code = failure.code
  if (!declared.has(code)) {
    emitOperationalEvent(createWideEvent({
      'operation': 'api-v1-contract',
      'outcome': 'failed',
      'api.operation': operation.id,
      'reason': `undeclared error code ${code}`,
    }), 'error')
    code = 'INTERNAL_ERROR'
  }
  const status = SKILLD_V1_ERROR_STATUS[code]
  const problem = problemSchema.producer.parse({
    type: problemType(code),
    title: SKILLD_V1_ERROR_TITLES[code],
    status,
    detail: status < 500 && failure.detail ? failure.detail.slice(0, 1000) : undefined,
    instance: event.path,
    code,
  })
  setResponseStatus(event, status)
  setHeader(event, 'content-type', 'application/problem+json')
  setHeader(event, 'cache-control', 'private, no-store')
  // A browser on another origin must read the problem, or it sees a network error.
  if (operation.access === 'public')
    setHeader(event, 'access-control-allow-origin', '*')
  return problem
}

function setCacheHeaders(event: H3Event, operation: SkilldV1OperationDefinition): void {
  if (operation.cache._tag === 'private') {
    setHeader(event, 'cache-control', 'private, no-store')
    return
  }
  setHeader(event, 'cache-control', `public, max-age=${operation.cache.maxAgeSeconds}, stale-while-revalidate=${operation.cache.staleWhileRevalidateSeconds}`)
  // A public answer never varies by caller, so any origin may read it.
  setHeader(event, 'access-control-allow-origin', '*')
}
