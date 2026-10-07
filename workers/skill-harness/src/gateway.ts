import { MAX_REQUEST_BYTES, parseJson, readBoundedBody } from './contracts'

export type ModelProvider = 'google' | 'anthropic' | 'opencode-go'

const OPENCODE_GO_CHAT_URL = 'https://opencode.ai/zen/go/v1/chat/completions'
const OPENCODE_GO_MAX_OUTPUT_TOKENS = 8192
// Web search, hosted plugins, live search, and remote MCP run on the provider at a separate cost.
const OPENAI_COMPATIBLE_HOSTED_FIELDS = ['web_search_options', 'plugins', 'search_parameters', 'mcp_servers']

async function readModelInput(request: Request): Promise<{ _tag: 'Ok', value: Record<string, unknown> } | { _tag: 'Err', response: Response }> {
  const body = await readBoundedBody(request, MAX_REQUEST_BYTES)
  if (body === undefined)
    return { _tag: 'Err', response: Response.json({ code: 'REQUEST_TOO_LARGE' }, { status: 413 }) }
  const parsed = parseJson(body)
  if (parsed._tag === 'Err' || !parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value))
    return { _tag: 'Err', response: Response.json({ code: 'INVALID_MODEL_REQUEST' }, { status: 400 }) }
  return { _tag: 'Ok', value: parsed.value as Record<string, unknown> }
}

function openCodeGoOutputLimit(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? Math.min(value, OPENCODE_GO_MAX_OUTPUT_TOKENS)
    : OPENCODE_GO_MAX_OUTPUT_TOKENS
}

/** Only npm package retrieval and the configured model can leave the sandbox. */
export async function forwardSandboxRequest(
  request: Request,
  options: { provider: ModelProvider, model: string, apiKey: string, consumeModelCall: () => Promise<boolean>, fetch: typeof fetch },
): Promise<Response> {
  const fetchClient = options.fetch
  const url = new URL(request.url)
  if (url.protocol !== 'https:' || (url.port !== '' && url.port !== '443'))
    return Response.json({ code: 'DESTINATION_DENIED' }, { status: 403 })

  const modelPath = `/v1beta/models/${options.model}:streamGenerateContent`
  if (options.provider === 'google' && url.hostname === 'generativelanguage.googleapis.com' && url.pathname === modelPath && request.method === 'POST') {
    const parsed = await readModelInput(request)
    if (parsed._tag === 'Err')
      return parsed.response
    const input = parsed.value
    if (input.cachedContent)
      return Response.json({ code: 'MODEL_DENIED' }, { status: 403 })
    if (Array.isArray(input.tools) && input.tools.some(tool =>
      !tool || typeof tool !== 'object' || Array.isArray(tool)
      || Object.keys(tool).some(key => key !== 'functionDeclarations'),
    )) {
      return Response.json({ code: 'MODEL_TOOLS_DENIED' }, { status: 403 })
    }
    if (!await options.consumeModelCall())
      return Response.json({ code: 'MODEL_CALL_LIMIT' }, { status: 403 })
    // Fresh headers keep sandbox credentials, cookies, and project overrides out.
    return fetchClient(`https://generativelanguage.googleapis.com${modelPath}?alt=sse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': options.apiKey },
      body: JSON.stringify({ ...input, generationConfig: { ...input.generationConfig as object, maxOutputTokens: 4096 } }),
      redirect: 'manual',
    })
  }

  if (options.provider === 'anthropic' && url.hostname === 'api.anthropic.com' && url.pathname === '/v1/messages' && request.method === 'POST') {
    const parsed = await readModelInput(request)
    if (parsed._tag === 'Err')
      return parsed.response
    const input = parsed.value
    if (input.mcp_servers || (Array.isArray(input.tools) && input.tools.some(tool =>
      !tool || typeof tool !== 'object' || Array.isArray(tool)
      || ('type' in tool && tool.type !== 'custom'),
    ))) {
      return Response.json({ code: 'MODEL_TOOLS_DENIED' }, { status: 403 })
    }
    if (!await options.consumeModelCall())
      return Response.json({ code: 'MODEL_CALL_LIMIT' }, { status: 403 })
    const standardInput = { ...input }
    delete standardInput.speed
    const thinking = input.thinking && typeof input.thinking === 'object' && 'type' in input.thinking && input.thinking.type === 'enabled'
      ? { type: 'enabled', budget_tokens: 2048 }
      : input.thinking
    return fetchClient('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': options.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ ...standardInput, model: options.model, max_tokens: 8192, service_tier: 'standard_only', thinking }),
      redirect: 'manual',
    })
  }

  if (options.provider === 'opencode-go' && `${url.origin}${url.pathname}` === OPENCODE_GO_CHAT_URL && request.method === 'POST') {
    const parsed = await readModelInput(request)
    if (parsed._tag === 'Err')
      return parsed.response
    const input = parsed.value
    if (OPENAI_COMPATIBLE_HOSTED_FIELDS.some(field => field in input) || (input.tools !== undefined && (!Array.isArray(input.tools) || input.tools.some(tool =>
      !tool || typeof tool !== 'object' || Array.isArray(tool) || tool.type !== 'function',
    )))) {
      return Response.json({ code: 'MODEL_TOOLS_DENIED' }, { status: 403 })
    }
    if (!await options.consumeModelCall())
      return Response.json({ code: 'MODEL_CALL_LIMIT' }, { status: 403 })
    // Extra choices multiply output cost. A priority tier raises the price.
    const standardInput = { ...input }
    delete standardInput.n
    delete standardInput.service_tier
    return fetchClient(OPENCODE_GO_CHAT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': `Bearer ${options.apiKey}` },
      body: JSON.stringify({
        ...standardInput,
        model: options.model,
        max_tokens: openCodeGoOutputLimit(input.max_tokens),
        ...('max_completion_tokens' in input ? { max_completion_tokens: openCodeGoOutputLimit(input.max_completion_tokens) } : {}),
      }),
      redirect: 'manual',
    })
  }

  const sourceHost = url.hostname === 'registry.npmjs.org' || url.hostname === 'codeload.github.com'
  if (sourceHost && request.method === 'GET') {
    return fetchClient(url, {
      headers: { 'user-agent': 'skilld-harness-proof' },
      redirect: 'manual',
    })
  }
  return Response.json({ code: 'DESTINATION_DENIED' }, { status: 403 })
}
