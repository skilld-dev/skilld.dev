// Plain-HTML digest template. Functional, side-effect free, no Vue SSR
// dependency in the worker hot path. If we ever want richer rendering we
// can swap this for vue-email/render — same input shape.

export interface DigestRepoEntry {
  owner: string
  repo: string
  skillNames: string[]
  skills: Array<{
    name: string
    changeCount: number
    commitMessages: string[]
  }>
  changeCount: number
  // Optional generated sentence; if absent we render commit messages.
  summary?: string | null
}

export interface DigestRenderInput {
  login: string
  windowStart: number
  windowEnd: number
  entries: DigestRepoEntry[]
  unsubscribeUrl: string
}

export interface DigestRender {
  subject: string
  html: string
  text: string
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function fmtDate(epoch: number): string {
  return new Date(epoch * 1000).toISOString().slice(0, 10)
}

export function renderDigest(input: DigestRenderInput): DigestRender {
  const { entries, unsubscribeUrl, windowStart, windowEnd, login } = input
  const repoLabel = entries.length === 1 ? '1 repo' : `${entries.length} repos`
  const subject = `[skilld] ${repoLabel} changed`

  const itemsHtml = entries.map((e) => {
    const skillUrl = `https://skilld.dev/gh/${e.owner}/${e.repo}/${encodeURIComponent(e.skillNames[0]!)}`
    const repoUrl = `https://github.com/${e.owner}/${e.repo}`
    const body = e.summary
      ? `<div style="margin:8px 0 0 0;color:#777;font-size:11px;font-family:'IBM Plex Mono',ui-monospace,monospace;">Generated summary</div><p style="margin:4px 0 0 0;color:#333;">${esc(e.summary)}</p>`
      : `<ul style="margin:6px 0 0 0;padding-left:18px;color:#333;">${
        e.skills.flatMap(skill =>
          skill.commitMessages.slice(0, 4).map(message =>
            `<li>${esc(skill.name)}: ${esc(message)}</li>`)).join('')
      }</ul>`
    return `
<tr><td style="padding:14px 0;border-bottom:1px solid #eee;">
  <div style="font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:13px;font-weight:600;">
    <a href="${esc(skillUrl)}" style="color:#111;text-decoration:none;">${esc(e.owner)}/${esc(e.repo)}</a>
  </div>
  <div style="color:#666;font-size:12px;font-family:'IBM Plex Mono',ui-monospace,monospace;">
    ${esc(e.skillNames.join(', '))} · ${e.changeCount} change${e.changeCount === 1 ? '' : 's'} · <a href="${esc(repoUrl)}" style="color:#666;">github</a>
  </div>
  ${body}
</td></tr>`
  }).join('')

  const itemsText = entries.map((e) => {
    const lines = [`* ${e.owner}/${e.repo}: ${e.skillNames.join(', ')} (${e.changeCount} changes)`]
    if (e.summary) {
      lines.push('  Generated summary')
      lines.push(`  ${e.summary}`)
    }
    else {
      lines.push(...e.skills.flatMap(skill =>
        skill.commitMessages.slice(0, 4).map(message => `  - ${skill.name}: ${message}`)))
    }
    return lines.join('\n')
  }).join('\n\n')

  const html = `<!doctype html>
<html><body style="margin:0;background:#fafafa;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#fafafa;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="background:#fff;border:1px solid #eee;border-radius:8px;padding:24px;font-family:-apple-system,Segoe UI,Inter,Roboto,sans-serif;">
      <tr><td>
        <div style="font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:14px;color:#666;">skilld digest</div>
        <h1 style="margin:6px 0 0 0;font-family:'Plus Jakarta Sans',sans-serif;font-size:18px;">Hey @${esc(login)}, ${repoLabel} you watch changed</h1>
        <div style="color:#999;font-size:12px;font-family:'IBM Plex Mono',ui-monospace,monospace;">${fmtDate(windowStart)} → ${fmtDate(windowEnd)}</div>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:16px;">
          ${itemsHtml}
        </table>
        <p style="margin-top:24px;font-size:12px;color:#999;">
          You're receiving this because you watch repos on skilld.dev. <a href="${esc(unsubscribeUrl)}" style="color:#999;">Unsubscribe</a>.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`

  const text = `skilld digest: ${fmtDate(windowStart)} to ${fmtDate(windowEnd)}

Hey @${login}, ${repoLabel} you watch changed:

${itemsText}

Unsubscribe: ${unsubscribeUrl}
`
  return { subject, html, text }
}
