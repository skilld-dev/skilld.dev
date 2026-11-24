import { H3Event } from 'h3'

export function createTestEvent(options: RequestInit & { path?: string, context?: Record<string, unknown> } = {}): H3Event {
  const { path = '/', context, ...request } = options
  const event = new H3Event(new Request(new URL(path, 'https://skilld.dev'), request))
  // Happy DOM drops Cookie from browser requests. These fixtures model server requests.
  for (const [name, value] of new Headers(request.headers))
    event.req.headers.set(name, value)
  Object.assign(event.context, context)
  return event
}
