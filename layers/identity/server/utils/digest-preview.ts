import type { DigestSelection, DigestUser } from './digest-select'
import type { DigestRender, DigestRenderInput } from './digest-template'
import type { SendEmailInput, SendEmailResult } from './email'
import { digestEmailHeaders } from './email'

interface PreviewDependencies {
  select: (user: DigestUser, windowStart: number, windowEnd: number) => Promise<DigestSelection | null>
  render: (input: DigestRenderInput) => DigestRender
  signUnsubscribe: (userId: number) => Promise<string>
  send: (input: SendEmailInput) => Promise<SendEmailResult>
}

export type DigestPreviewResult
  = | { _tag: 'empty', changeCount: 0 }
    | { _tag: 'rendered', changeCount: number, rendered: DigestRender }
    | { _tag: 'sent', changeCount: number, delivery: SendEmailResult }

/** Preview real selection without claiming deliveries or advancing the digest cursor. */
export async function previewDigest(
  deps: PreviewDependencies,
  user: DigestUser,
  input: { windowEnd: number, siteUrl: string, to?: string },
): Promise<DigestPreviewResult> {
  const selection = await deps.select(user, input.windowEnd - 30 * 24 * 60 * 60, input.windowEnd)
  if (!selection?.entries.length)
    return { _tag: 'empty', changeCount: 0 }
  const changeCount = selection.entries.reduce((count, entry) => count + entry.changeCount, 0)
  const token = await deps.signUnsubscribe(user.id)
  const unsubscribeUrl = `${input.siteUrl}/api/unsubscribe?t=${encodeURIComponent(token)}&list=digest`
  const rendered = deps.render({
    login: user.login,
    recipientName: user.name,
    countClicks: false,
    windowStart: selection.windowStart,
    windowEnd: selection.windowEnd,
    siteUrl: input.siteUrl,
    unsubscribeUrl,
    entries: selection.entries,
  })
  if (!input.to)
    return { _tag: 'rendered', changeCount, rendered }
  const delivery = await deps.send({
    to: input.to,
    subject: `[test] ${rendered.subject}`,
    html: rendered.html,
    text: rendered.text,
    headers: digestEmailHeaders(unsubscribeUrl, `skilld-digest-test:${user.id}:${input.windowEnd}`),
  })
  return { _tag: 'sent', changeCount, delivery }
}
