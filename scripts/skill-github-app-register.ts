import type { IncomingMessage, ServerResponse } from 'node:http'
import { createPrivateKey, randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { z } from 'zod'

const [workerUrl, scratchDirectory, portInput = '8792'] = process.argv.slice(2)
if (!workerUrl || !scratchDirectory)
  throw new Error('Pass the Worker URL and a private scratch directory.')
const origin = new URL(workerUrl)
if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/')
  throw new Error('Use an HTTPS Worker origin without credentials or a path.')
const state = randomBytes(32).toString('hex')
const port = Number(portInput)
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('Use a local port from 1024 through 65535.')
const callback = `http://127.0.0.1:${port}/callback/${state}`
const manifest = {
  name: 'skilld',
  description: 'Propose Skill updates through draft pull requests after new tags.',
  url: 'https://skilld.dev',
  hook_attributes: { url: new URL('/github/webhook', origin).href, active: true },
  redirect_url: callback,
  public: false,
  default_permissions: { contents: 'write', pull_requests: 'write', metadata: 'read' },
  default_events: ['create'],
}

const appSchema = z.object({ id: z.number().int().positive(), owner: z.object({ login: z.literal('harlan-zw') }), pem: z.string().min(1), webhook_secret: z.string().min(1), html_url: z.string().url() })
function html(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`)
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('Content-Type', 'text/html; charset=utf-8')
  response.setHeader('Content-Security-Policy', 'default-src \'none\'; form-action https://github.com; base-uri \'none\'; frame-ancestors \'none\'')
  if (request.method !== 'GET') {
    response.writeHead(405).end('Use GET.')
    return
  }
  if (url.pathname === `/setup/${state}`) {
    response.setHeader('Set-Cookie', `skilld_app_setup=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600`)
    response.end(`<h1>Register skilld</h1><p>This private pilot reads package source and proposes draft Skill pull requests.</p><p>It requests Contents write and Pull requests write. Select one repository during installation.</p><form method="post" action="https://github.com/settings/apps/new?state=${state}"><input type="hidden" name="manifest" value="${html(JSON.stringify(manifest))}"><button>Register GitHub App</button></form>`)
    return
  }
  const supplied = Buffer.from(url.searchParams.get('state') ?? '')
  const expected = Buffer.from(state)
  if (url.pathname !== `/callback/${state}` || supplied.length !== expected.length || !timingSafeEqual(supplied, expected) || !request.headers.cookie?.split(';').some(cookie => cookie.trim() === `skilld_app_setup=${state}`)) {
    response.writeHead(403).end('Registration state is invalid.')
    return
  }
  const code = url.searchParams.get('code')
  if (!code || !/^[a-z0-9]+$/i.test(code)) {
    response.writeHead(400).end('Registration code is invalid.')
    return
  }
  const converted = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'accept': 'application/vnd.github+json', 'user-agent': 'skilld.dev', 'x-github-api-version': '2026-03-10' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!converted.ok)
    throw new Error(`GitHub registration returned ${converted.status}.`)
  const app = appSchema.parse(await converted.json())
  const appUrl = new URL(app.html_url)
  if (appUrl.hostname !== 'github.com' || !/^\/apps\/[a-z0-9-]+$/.test(appUrl.pathname))
    throw new Error('GitHub returned an invalid App URL.')
  await mkdir(scratchDirectory, { recursive: true, mode: 0o700 })
  const secretsPath = join(scratchDirectory, 'github-app-secrets.json')
  const key = createPrivateKey(app.pem).export({ type: 'pkcs8', format: 'pem' }).toString()
  await writeFile(secretsPath, JSON.stringify({ GITHUB_APP_ID: String(app.id), GITHUB_APP_PRIVATE_KEY_PKCS8: key, GITHUB_APP_WEBHOOK_SECRET: app.webhook_secret }), { mode: 0o600, flag: 'wx' })
  await writeFile(join(scratchDirectory, 'github-app.json'), JSON.stringify({ id: app.id, url: appUrl.href, installationUrl: `${appUrl.href}/installations/new` }), { mode: 0o600, flag: 'wx' })
  response.end('<h1>GitHub App registered</h1><p>The private configuration is saved. Wait for the Worker configuration before installing.</p>')
  console.log(`App registered: ${appUrl.href}. Private configuration saved to ${secretsPath}.`)
}

const server = createServer((request, response) => {
  void handle(request, response).catch((cause: unknown) => {
    console.error(cause instanceof Error ? cause.message : String(cause))
    if (!response.headersSent)
      response.writeHead(500)
    response.end('Registration failed. Check the local log.')
  })
})
server.listen(port, '127.0.0.1', () => {
  console.log(`Open http://127.0.0.1:${port}/setup/${state}`)
})
