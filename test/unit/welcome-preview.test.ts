import type { EventHandler, H3Event } from 'h3'
import { afterEach, expect, it, vi } from 'vitest'
import { WELCOME_EMAIL_COPY } from '../../shared/welcome-email-copy'

afterEach(() => vi.unstubAllGlobals())

it('renders a public welcome preview without account data or a delivery token', async () => {
  const header = vi.fn()
  vi.stubGlobal('defineEventHandler', (handler: EventHandler) => handler)
  vi.stubGlobal('setHeader', header)
  const handler = (await import('../../layers/identity/server/routes/welcome/preview.get')).default
  const event = { method: 'GET', context: {} } as H3Event
  const html = await handler(event)
  expect(html).toContain(WELCOME_EMAIL_COPY.story)
  expect(html).toContain('href="https://skilld.dev/me"')
  expect(html).toContain('Email preferences')
  expect(html).not.toContain('Stop welcome emails')
  expect(html).not.toContain('/api/unsubscribe')
  expect(header).toHaveBeenCalledWith(event, 'x-robots-tag', 'noindex, follow')
  expect(header).toHaveBeenCalledWith(event, 'content-type', 'text/html; charset=utf-8')
})
