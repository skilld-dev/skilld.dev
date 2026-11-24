import { H3Event } from 'h3'

export function createTestEvent(options: RequestInit & { path?: string, context?: Record<string, unknown> } = {}): H3Event {
  const { path = '/', context, ...request } = options
  const event = new H3Event(new Request(new URL(path, 'https://skilld.dev'), request))
  Object.assign(event.context, context)
  return event
}
