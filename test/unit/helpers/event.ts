import { H3Event } from 'h3'

export function createTestEvent(options: RequestInit & {
  path?: string
  context?: Record<string, unknown>
  waitUntil?: (promise: Promise<unknown>) => void
} = {}): H3Event {
  const { path = '/', context, waitUntil, ...request } = options
  const webRequest = new Request(new URL(path, 'https://skilld.dev'), request)
  if (waitUntil)
    (webRequest as Request & { waitUntil?: (promise: Promise<unknown>) => void }).waitUntil = waitUntil
  const event = new H3Event(webRequest)
  // Happy DOM drops Cookie from browser requests. These fixtures model server requests.
  for (const [name, value] of new Headers(request.headers))
    event.req.headers.set(name, value)
  Object.assign(event.context, context)
  return event
}
