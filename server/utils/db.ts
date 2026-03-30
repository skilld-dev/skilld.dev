/// <reference types="@cloudflare/workers-types" />
import type { H3Event } from 'h3'

export function getDB(event: H3Event): D1Database {
  return event.context.cloudflare.env.DB as D1Database
}
