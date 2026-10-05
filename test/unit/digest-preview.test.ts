import type { DigestSelection, DigestUser } from '../../layers/identity/server/utils/digest-select'
import { describe, expect, it, vi } from 'vitest'
import { canPreviewDigest } from '../../layers/identity/server/policies/digest-preview'
import { digestPreviewSchema } from '../../layers/identity/server/schemas/digest-preview'
import { previewDigest } from '../../layers/identity/server/utils/digest-preview'
import { renderDigest } from '../../layers/identity/server/utils/digest-template'

const user: DigestUser = {
  id: 7,
  login: 'operator',
  name: null,
  digest_email: 'selected@example.com',
  email: null,
  email_opt_in: 1,
  onboarded_at: 1,
}
const entry = {
  owner: 'acme',
  repo: 'skills',
  skillNames: ['review'],
  changeCount: 1,
  skills: [{
    name: 'review',
    description: 'Review code',
    changeCount: 1,
    commitMessages: ['Improve review'],
    changedAt: 100,
    sourceUrl: 'https://github.com/acme/skills/blob/main/SKILL.md',
    changeUrl: 'https://github.com/acme/skills/commit/abc',
  }],
}
const selection: DigestSelection = {
  user,
  windowStart: 1,
  windowEnd: 200,
  cursorStart: 1,
  cursorEnd: 2,
  entries: [entry],
}
function dependencies(selected = selection) {
  return {
    select: vi.fn().mockResolvedValue(selected),
    render: renderDigest,
    signUnsubscribe: vi.fn().mockResolvedValue('signed-token'),
    send: vi.fn().mockResolvedValue({ _tag: 'accepted', messageId: 'provider-id' }),
  }
}

describe('digest rehearsal', () => {
  it('renders actual watched changes without sending to the selected account', async () => {
    const deps = dependencies()
    const result = await previewDigest(deps, user, { windowEnd: 200, siteUrl: 'https://skilld.dev' })
    expect(result._tag).toBe('rendered')
    if (result._tag !== 'rendered')
      throw new Error('Expected rendered preview')
    expect(result.rendered.html).toContain(entry.skills[0]!.changeUrl)
    expect(result.rendered.text).toContain('Improve review')
    expect(deps.send).not.toHaveBeenCalled()
  })

  it('sends only to the explicit destination with production unsubscribe headers', async () => {
    const deps = dependencies()
    const result = await previewDigest(deps, user, { windowEnd: 200, siteUrl: 'https://skilld.dev', to: 'operator@example.com' })
    expect(result).toEqual({ _tag: 'sent', changeCount: 1, delivery: { _tag: 'accepted', messageId: 'provider-id' } })
    expect(deps.send).toHaveBeenCalledWith(expect.objectContaining({
      to: 'operator@example.com',
      subject: expect.stringMatching(/^\[test\]/),
      headers: {
        'List-Unsubscribe': '<https://skilld.dev/api/unsubscribe?t=signed-token&list=digest>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Campaign-ID': 'skilld-digest-test:7:200',
      },
    }))
  })

  it('keeps an empty watch window silent', async () => {
    const deps = dependencies({ ...selection, entries: [] })
    expect(await previewDigest(deps, user, { windowEnd: 200, siteUrl: 'https://skilld.dev', to: 'operator@example.com' }))
      .toEqual({ _tag: 'empty', changeCount: 0 })
    expect(deps.send).not.toHaveBeenCalled()
  })

  it('preserves provider rejection and uncertainty', async () => {
    for (const delivery of [{ _tag: 'rejected', error: 'Unverified destination' }, { _tag: 'uncertain', error: 'No message ID' }]) {
      const deps = dependencies()
      deps.send.mockResolvedValue(delivery)
      expect(await previewDigest(deps, user, { windowEnd: 200, siteUrl: 'https://skilld.dev', to: 'operator@example.com' }))
        .toEqual({ _tag: 'sent', changeCount: 1, delivery })
    }
  })

  it('rejects a malformed destination before previewing', () => {
    expect(digestPreviewSchema.safeParse({ to: 'not-an-email' }).success).toBe(false)
  })

  it('requires admin authorization', async () => {
    const denied = new Error('Forbidden')
    vi.stubGlobal('requireAdmin', vi.fn().mockRejectedValue(denied))
    await expect(canPreviewDigest({ event: {} } as Parameters<typeof canPreviewDigest>[0])).rejects.toBe(denied)
    vi.unstubAllGlobals()
  })
})
