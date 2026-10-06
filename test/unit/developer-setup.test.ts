import type { SkilldV1OperationDefinition } from 'skilld-sdk/contract'
import type { ApiSampleCall } from '../../layers/marketing/app/utils/developer-setup'
import { createSkilldClient } from 'skilld-sdk'
import { skilldV1Protocol } from 'skilld-sdk/contract'
import { describe, expect, it } from 'vitest'
import { apiSampleCalls, curlCall, cursorInstallUrl, vscodeInstallUrl } from '../../layers/marketing/app/utils/developer-setup'

describe('mCP install links', () => {
  it('gives Cursor the server URL as base64 JSON under the skilld name', () => {
    const link = new URL(cursorInstallUrl('https://example.test/api/mcp?x=1'))
    expect(`${link.protocol}//${link.host}${link.pathname}`).toBe('cursor://anysphere.cursor-deeplink/mcp/install')
    expect(link.searchParams.get('name')).toBe('skilld')
    expect(JSON.parse(atob(link.searchParams.get('config')!))).toEqual({ url: 'https://example.test/api/mcp?x=1' })
  })

  it('gives VS Code the whole server entry as one encoded JSON query', () => {
    const link = vscodeInstallUrl('https://example.test/api/mcp?x=1')
    const [scheme, query] = link.split('?', 2)
    expect(scheme).toBe('vscode:mcp/install')
    expect(JSON.parse(decodeURIComponent(query!))).toEqual({
      name: 'skilld',
      type: 'http',
      url: 'https://example.test/api/mcp?x=1',
    })
  })
})

interface SentRequest {
  method: string
  path: string
  /** The query as the server parses it, defaults filled in. */
  query: unknown
  token: boolean
}

function contractOperation(call: ApiSampleCall): SkilldV1OperationDefinition | undefined {
  const registries = skilldV1Protocol.registries as Readonly<Record<string, { operations: Readonly<Record<string, SkilldV1OperationDefinition>> }>>
  return registries[call.namespace]?.operations[call.key]
}

function received(operation: SkilldV1OperationDefinition, method: string, url: string, token: boolean): SentRequest {
  const { pathname, searchParams } = new URL(url)
  const query = operation.request.query?.parse(Object.fromEntries(searchParams)) ?? null
  return { method, path: pathname, query, token }
}

/** What the SDK puts on the wire for the printed SDK call, or why it sent nothing. */
async function sentBySdk(operation: SkilldV1OperationDefinition, call: ApiSampleCall): Promise<SentRequest | { refused: unknown }> {
  let sent: SentRequest | undefined
  const skilld = createSkilldClient({
    retry: { maxAttempts: 1 },
    fetch: async (url, init) => {
      sent = received(operation, String(init.method), url, new Headers(init.headers).has('authorization'))
      return new Response(null, { status: 204 })
    },
  })
  const namespaces = skilld as unknown as Record<string, Record<string, ((input: unknown) => Promise<{ error?: unknown }>) | undefined> | undefined>
  const send = namespaces[call.namespace]?.[call.key]
  if (!send)
    return { refused: `the SDK has no skilld.${call.namespace}.${call.key}` }
  const result = await send({ params: call.params, query: call.query })
  return sent ?? { refused: result.error }
}

/** What a printed cURL command sends. */
function sentByCurl(operation: SkilldV1OperationDefinition, command: string): SentRequest {
  return received(
    operation,
    command.match(/-X (\w+)/)?.[1] ?? 'GET',
    command.match(/'([^']+)'/)![1]!,
    command.includes('Authorization: Bearer $SKILLD_TOKEN'),
  )
}

describe('aPI samples on the developers page', () => {
  it.each(Object.entries(apiSampleCalls))('%s names an operation at its contract method and path', (_name, call) => {
    const operation = contractOperation(call)
    expect(operation && { method: operation.method, path: operation.path, account: operation.access === 'account' })
      .toEqual({ method: call.method, path: call.path, account: call.account })
  })

  it.each(Object.entries(apiSampleCalls))('%s prints a cURL command that sends what the SDK call sends', async (_name, call) => {
    const operation = contractOperation(call)
    expect(operation, `no operation ${call.namespace}.${call.key}`).toBeDefined()
    const sdk = await sentBySdk(operation!, call)
    expect(sdk).not.toHaveProperty('refused')
    // The SDK holds no token here, so only the cURL command carries one, and only for an account operation.
    expect(sentByCurl(operation!, curlCall(call))).toEqual({ ...sdk, token: operation!.access === 'account' })
  })
})
