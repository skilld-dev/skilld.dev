import { MAX_REQUEST_BYTES, parseJson, readBoundedBody } from './contracts'

/** Only npm package retrieval and the configured model can leave the sandbox. */
export async function forwardSandboxRequest(
  request: Request,
  options: { model: string, apiKey: string, consumeModelCall: () => Promise<boolean>, fetch: typeof fetch },
): Promise<Response> {
  const fetchClient = options.fetch
  const url = new URL(request.url)
  if (url.protocol !== 'https:' || (url.port !== '' && url.port !== '443'))
    return Response.json({ code: 'DESTINATION_DENIED' }, { status: 403 })

  const modelPath = `/v1beta/models/${options.model}:streamGenerateContent`
  if (url.hostname === 'generativelanguage.googleapis.com' && url.pathname === modelPath && request.method === 'POST') {
    const body = await readBoundedBody(request, MAX_REQUEST_BYTES)
    if (body === undefined)
      return Response.json({ code: 'REQUEST_TOO_LARGE' }, { status: 413 })
    const parsed = parseJson(body)
    if (parsed._tag === 'Err' || !parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value))
      return Response.json({ code: 'INVALID_MODEL_REQUEST' }, { status: 400 })
    const input = parsed.value as Record<string, unknown>
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

  const sourceHost = url.hostname === 'registry.npmjs.org' || url.hostname === 'codeload.github.com'
  if (sourceHost && request.method === 'GET') {
    return fetchClient(url, {
      headers: { 'user-agent': 'skilld-harness-proof' },
      redirect: 'manual',
    })
  }
  return Response.json({ code: 'DESTINATION_DENIED' }, { status: 403 })
}
