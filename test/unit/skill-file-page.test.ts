import type { H3Event } from 'h3'
import { createApp, defineEventHandler, getRequestHeader, toWebHandler } from 'h3'
import { describe, expect, it, vi } from 'vitest'
import registerPlugin from '../../server/plugins/skill-file-page'

vi.hoisted(() => {
  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
})

async function request(path: string) {
  let onRequest: (event: H3Event) => void = () => {}
  const app = createApp({ onRequest: event => onRequest(event) })
  const nitro = {
    hooks: {
      hook(_name: string, callback: typeof onRequest) {
        onRequest = callback
      },
    },
  }
  registerPlugin(nitro as unknown as Parameters<typeof registerPlugin>[0])
  // A module can prepend its own h3 middleware. It must see the guard before
  // it decides whether a .md URL names a file or a page's Markdown twin.
  app.use(defineEventHandler(event => ({
    path: event.path,
    internal: getRequestHeader(event, 'x-ai-ready-internal') ?? null,
  })))
  return toWebHandler(app)(new Request(`http://localhost${path}`))
}

describe('skill file request ownership', () => {
  it.each([
    '/gh/huggingface/skills/huggingface-lora-space-builder/-/references/adapting-to-the-lora.md',
    '/gh/anthropics/skills/pdf/-/reference.md?section=setup',
    '/gh/anthropics/skills/pdf/-/scripts/check_bounding_boxes.py',
  ])('claims %s before h3 middleware runs', async (path) => {
    const response = await request(path)
    expect(await response.json()).toEqual({ path, internal: '1' })
  })

  it.each([
    '/gh/anthropics/skills/pdf.md',
    '/gh/anthropics/skills/pdf',
    '/index.md',
  ])('leaves the page representation for %s to the module', async (path) => {
    const response = await request(path)
    expect(await response.json()).toEqual({ path, internal: null })
  })
})
