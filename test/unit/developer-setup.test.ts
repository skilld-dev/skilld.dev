// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { cursorInstallUrl, vscodeInstallUrl } from '../../layers/marketing/app/utils/developer-setup'

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
