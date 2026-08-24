/// <reference types="@cloudflare/workers-types" />

/**
 * Turning off one list without touching the other.
 *
 * Kept apart from the route so the POST half required by RFC 8058 one-click
 * unsubscribe and the GET half a person clicks run identical SQL.
 */

export type UnsubList = 'weekly' | 'digest'

export interface UnsubOutcome {
  list: UnsubList
  heading: string
  body: string
}

export type EmailPreferenceAction = 'unsubscribed' | 'restored'

async function writePreference(
  db: D1Database,
  userId: number,
  list: UnsubList,
  action: EmailPreferenceAction,
): Promise<void> {
  const value = action === 'restored'
  const setting = list === 'weekly'
    ? db.prepare(`UPDATE users SET weekly_opt_out = ?2 WHERE id = ?1`).bind(userId, value ? 0 : 1)
    : db.prepare(`UPDATE users SET email_opt_in = ?2 WHERE id = ?1`).bind(userId, value ? 1 : 0)
  const event = db.prepare(
    `INSERT INTO email_preference_events (user_id, list, action, occurred_at)
     VALUES (?1, ?2, ?3, unixepoch())`,
  ).bind(userId, list, action)
  await db.batch([setting, event])
}

export async function applyUnsubscribe(
  db: D1Database,
  userId: number,
  list: UnsubList,
): Promise<UnsubOutcome> {
  await writePreference(db, userId, list, 'unsubscribed')
  if (list === 'weekly') {
    return {
      list,
      heading: 'Unsubscribed.',
      body: 'You will not get the weekly again. Your digest setting is unchanged.',
    }
  }
  return {
    list,
    heading: 'Unsubscribed.',
    body: 'You will not get the digest again.',
  }
}

export async function applyResubscribe(
  db: D1Database,
  userId: number,
  list: UnsubList,
): Promise<UnsubOutcome> {
  await writePreference(db, userId, list, 'restored')
  return {
    list,
    heading: 'Email restored.',
    body: list === 'weekly'
      ? 'You will get the weekly again.'
      : 'You will get the digest again.',
  }
}

export type UnsubscribePageInput
  = { _tag: 'confirm', token: string, list: UnsubList }
    | { _tag: 'complete', token: string, list: UnsubList, action: EmailPreferenceAction }
    | { _tag: 'invalid' }

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function renderUnsubscribePage(input: UnsubscribePageInput): string {
  const list = input._tag === 'invalid' ? null : input.list
  const label = list === 'weekly' ? 'weekly' : 'digest'
  const title = input._tag === 'confirm'
    ? `Stop ${label} emails?`
    : input._tag === 'invalid'
      ? 'This link is invalid'
      : input.action === 'restored'
        ? 'Email restored'
        : 'Email stopped'
  const body = input._tag === 'confirm'
    ? `You can restore ${label} emails after this change.`
    : input._tag === 'invalid'
      ? 'Open the latest email and try its unsubscribe link again.'
      : input.action === 'restored'
        ? `You will get ${label} emails again.`
        : `You will not get ${label} emails.`
  const action = input._tag === 'confirm'
    ? `<form method="post" action="/api/unsubscribe">
        <input type="hidden" name="t" value="${esc(input.token)}">
        <input type="hidden" name="list" value="${input.list}">
        <button type="submit">Stop ${label} emails</button>
      </form>`
    : input._tag === 'complete' && input.action === 'unsubscribed'
      ? `<form method="post" action="/api/unsubscribe/undo">
          <input type="hidden" name="t" value="${esc(input.token)}">
          <input type="hidden" name="list" value="${input.list}">
          <button type="submit">Restore ${label} emails</button>
        </form>`
      : ''

  return `<!doctype html>
<html lang="en" style="color-scheme:light dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#f5f4f2">
  <title>${esc(title)} · skilld</title>
  <style>
    :root{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#f5f4f2;color:#1c1917}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:max(20px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(20px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left))}
    main{width:100%;max-width:480px;background:#fff;border:1px solid #d6d3d1;border-radius:8px;padding:clamp(20px,6vw,32px)}
    .brand{font-weight:700;font-size:14px}.mark{color:#be123c}h1{margin:28px 0 8px;font-family:ui-sans-serif,system-ui,sans-serif;font-size:clamp(22px,6vw,28px);line-height:1.2;text-wrap:balance}p{margin:0;color:#57504b;font-family:ui-sans-serif,system-ui,sans-serif;font-size:16px;line-height:1.6}
    form{margin-top:24px}button,a{min-height:44px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;font:600 14px/1.2 inherit;touch-action:manipulation}button{border:0;background:#be123c;color:#fff;padding:12px 18px;cursor:pointer}a{margin-top:12px;color:#57504b;text-underline-offset:3px}
    button:hover{background:#9f1239}a:hover{color:#1c1917}button:focus-visible,a:focus-visible{outline:3px solid #fb7185;outline-offset:3px}
    @media(prefers-color-scheme:dark){:root{background:#14110d;color:#ede9e4}main{background:#1c1917;border-color:#4d453b}p,a{color:#cdc6bd}a:hover{color:#fff}}
  </style>
</head>
<body><main><div class="brand"><span class="mark">◆</span> skilld</div><h1>${esc(title)}</h1><p>${esc(body)}</p>${action}<a href="/me">Email settings</a></main></body>
</html>`
}
