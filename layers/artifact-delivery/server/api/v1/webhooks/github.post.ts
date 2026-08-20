import {
  getHeader,
  setHeader,
  setResponseStatus,
  toWebRequest,
} from 'h3'
import { verifyGithubWebhookSignature } from '../../../utils/github-app'
import { processGithubAppWebhook } from '../../../utils/private-access'

const MAX_GITHUB_WEBHOOK_BYTES = 512 * 1024

export default defineEventHandler(async (event) => {
  const platform = event.context.platform
  if (!platform)
    throw createError({ statusCode: 503, message: 'Service unavailable' })
  setHeader(event, 'cache-control', 'no-store')
  const declared = Number(getHeader(event, 'content-length'))
  if (Number.isFinite(declared) && declared > MAX_GITHUB_WEBHOOK_BYTES) {
    setResponseStatus(event, 413)
    return { accepted: false, code: 'REQUEST_TOO_LARGE' }
  }
  const bodyResult = await readBoundedBody(toWebRequest(event))
  if (bodyResult._tag !== 'body') {
    setResponseStatus(event, bodyResult._tag === 'too-large' ? 413 : 400)
    return {
      accepted: false,
      code: bodyResult._tag === 'too-large' ? 'REQUEST_TOO_LARGE' : 'INVALID_REQUEST',
    }
  }
  const body = bodyResult.value
  if (!await verifyGithubWebhookSignature(
    platform.env.GITHUB_APP_WEBHOOK_SECRET,
    body,
    getHeader(event, 'x-hub-signature-256') ?? null,
  )) {
    setResponseStatus(event, 401)
    return { accepted: false, code: 'INVALID_SIGNATURE' }
  }
  const deliveryId = getHeader(event, 'x-github-delivery') ?? ''
  const githubEvent = getHeader(event, 'x-github-event') ?? ''
  const payload = parseJson(body)
  if (!payload) {
    setResponseStatus(event, 400)
    return { accepted: false, code: 'INVALID_REQUEST' }
  }
  const result = await processGithubAppWebhook(platform.db, {
    deliveryId,
    event: githubEvent,
    payload,
    now: Math.floor(Date.now() / 1000),
  })
  if (result._tag === 'invalid') {
    setResponseStatus(event, 400)
    return { accepted: false, code: 'INVALID_REQUEST' }
  }
  emitOperationalEvent(createWideEvent({
    operation: 'github-app-webhook',
    outcome: result._tag,
  }))
  setResponseStatus(event, 202)
  return { accepted: true }
})

function parseJson(bytes: Uint8Array): unknown | null {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
  }
  catch {
    return null
  }
}

async function readBoundedBody(request: Request): Promise<
  { _tag: 'body', value: Uint8Array }
  | { _tag: 'empty' | 'too-large' }
> {
  if (!request.body)
    return { _tag: 'empty' }
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const next = await reader.read()
    if (next.done)
      break
    size += next.value.byteLength
    if (size > MAX_GITHUB_WEBHOOK_BYTES) {
      await reader.cancel('request too large')
      return { _tag: 'too-large' }
    }
    chunks.push(next.value)
  }
  if (size === 0)
    return { _tag: 'empty' }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { _tag: 'body', value: body }
}
