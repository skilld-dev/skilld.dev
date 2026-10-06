import { MAX_REQUEST_BYTES, parseJson, readBoundedBody } from './contracts'
import { parseGithubEvent, verifyGithubSignature } from './github-events'
import { readSkillgenOptIns } from './skillgen-opt-ins'

export async function githubWebhook(request: Request, env: HarnessEnv, fetcher: typeof fetch = fetch): Promise<Response> {
  if (!env.GITHUB_APP_WEBHOOK_SECRET || !env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY_PKCS8 || !env.SKILLGEN_SITE_TOKEN)
    return Response.json({ code: 'APP_UNCONFIGURED' }, { status: 503 })
  const body = await readBoundedBody(request, MAX_REQUEST_BYTES)
  if (body === undefined)
    return Response.json({ code: 'REQUEST_TOO_LARGE' }, { status: 413 })
  if (!await verifyGithubSignature(env.GITHUB_APP_WEBHOOK_SECRET, new TextEncoder().encode(body), request.headers.get('x-hub-signature-256')))
    return Response.json({ code: 'INVALID_SIGNATURE' }, { status: 401 })
  const parsed = parseJson(body)
  if (parsed._tag === 'Err')
    return Response.json({ code: parsed.code }, { status: 400 })
  const event = parseGithubEvent(request.headers.get('x-github-event') ?? '', parsed.value)
  if (event._tag === 'Invalid')
    return Response.json({ code: 'INVALID_EVENT' }, { status: 400 })
  if (event._tag === 'Ignored')
    return Response.json({ accepted: true, jobs: [] }, { status: 202 })
  const optIns = await readSkillgenOptIns({
    siteUrl: env.SKILLD_SITE_URL,
    token: env.SKILLGEN_SITE_TOKEN,
    repositories: event.tags.map(tag => `${tag.owner}/${tag.name}`),
    fetch: fetcher,
  })
  if (optIns._tag === 'Unavailable')
    return Response.json({ code: 'OPT_IN_UNAVAILABLE' }, { status: 503 })
  const jobs = []
  for (const tag of event.tags) {
    if (!optIns.repositories.has(`${tag.owner}/${tag.name}`.toLowerCase()))
      continue
    const job = await env.GITHUB_JOBS.getByName('github-app').enqueue(tag)
    if (job._tag === 'Busy')
      return Response.json({ code: 'APP_QUEUE_FULL' }, { status: 503 })
    jobs.push(job.id)
  }
  return Response.json({ accepted: true, jobs }, { status: 202 })
}
