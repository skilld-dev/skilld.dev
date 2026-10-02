import type { ProofInput, ProofResult, ProofState } from './contracts'
import { Files, SandboxFileError } from '@cloudflare/sandbox'
import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers'
import { JOB_TIMEOUT_MS, MAX_MODEL_CALLS, MAX_REQUEST_BYTES, MAX_RESULT_BYTES, parseJson, parseProofInput, parseProofResult, readBoundedBody } from './contracts'
import { forwardSandboxRequest } from './gateway'
import { githubWebhook } from './github-routes'
import { startOutsideLock } from './startup'

export { GithubJobs } from './github-jobs'

function credentials(env: { PROVIDER: string, ANTHROPIC_API_KEY?: string, GOOGLE_GENERATIVE_AI_API_KEY?: string }): { provider: 'google' | 'anthropic', apiKey: string } | undefined {
  if (env.PROVIDER === 'anthropic' && env.ANTHROPIC_API_KEY)
    return { provider: 'anthropic', apiKey: env.ANTHROPIC_API_KEY }
  if (env.PROVIDER === 'google' && env.GOOGLE_GENERATIVE_AI_API_KEY)
    return { provider: 'google', apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY }
}

export class Outbound extends WorkerEntrypoint<HarnessEnv, { jobId: string }> {
  fetch(request: Request): Promise<Response> {
    return this.env.SANDBOX.getByName(this.ctx.props.jobId).broker(request)
  }
}

export class SkillSandbox extends DurableObject<HarnessEnv> {
  async reserve(jobId: string): Promise<boolean> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const lease = await this.ctx.storage.get<{ jobId: string, expiresAt: number }>('lease')
      if (lease && lease.expiresAt > Date.now())
        return false
      await this.ctx.storage.put('lease', { jobId, expiresAt: Date.now() + JOB_TIMEOUT_MS + 60_000 })
      return true
    })
  }

  async release(jobId: string): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      const lease = await this.ctx.storage.get<{ jobId: string }>('lease')
      if (lease?.jobId === jobId)
        await this.ctx.storage.delete('lease')
    })
  }

  async start(input: ProofInput, jobId: string): Promise<void> {
    await startOutsideLock(callback => this.ctx.blockConcurrencyWhile(callback), async () => {
      if (await this.ctx.storage.get('state'))
        throw new Error('JOB_ALREADY_STARTED')
      const state: ProofState = { _tag: 'Running', startedAt: Date.now(), modelCalls: 0 }
      await this.ctx.storage.put('state', state)
      await this.ctx.storage.put('jobId', jobId)
      await this.ctx.storage.setAlarm(Date.now() + JOB_TIMEOUT_MS)
      return state
    }, async (state) => {
      const container = this.ctx.container
      if (!container)
        throw new Error('CONTAINER_UNCONFIGURED')
      try {
        container.start({ image: container.images.runner, instance: 'standard-1', enableInternet: false })
        const outbound = this.ctx.exports.Outbound({ props: { jobId } })
        await container.interceptAllOutboundHttp(outbound)
        await container.interceptOutboundHttps('*', outbound)
        await container.setInactivityTimeout(JOB_TIMEOUT_MS + 60_000)
        const files = new Files(container)
        await files.mkdir('/job', { recursive: true })
        await files.writeFile('/job/input.json', JSON.stringify(input))
        const process = await container.exec(['sh', '-c', 'node /opt/harness/run.mjs > /job/runner.log 2>&1 &'], {
          stdout: 'ignore',
          stderr: 'ignore',
          env: {
            MODEL: this.env.MODEL,
            PROVIDER: this.env.PROVIDER,
            ANTHROPIC_API_KEY: 'sandbox-placeholder',
            GOOGLE_GENERATIVE_AI_API_KEY: 'sandbox-placeholder',
            NODE_EXTRA_CA_CERTS: '/etc/cloudflare/certs/cloudflare-containers-ca.crt',
            SSL_CERT_FILE: '/etc/cloudflare/certs/cloudflare-containers-ca.crt',
          },
        })
        if (await process.exitCode !== 0)
          throw new Error('RUNNER_START_FAILED')
        await this.ctx.storage.setAlarm(Date.now() + 10_000)
      }
      catch (cause) {
        await this.finishFailure('RUNNER_FAILED', cause instanceof Error ? cause.message : String(cause), state.startedAt)
        throw cause
      }
    })
  }

  async status(): Promise<ProofState | undefined> {
    const state = await this.ctx.storage.get<
      { _tag: 'Running', startedAt: number, modelCalls: number }
      | { _tag: 'Finished', chunks: number, modelCalls: number }
    >('state')
    if (state?._tag !== 'Finished')
      return state
    const keys = Array.from({ length: state.chunks }, (_, index) => `result-${index}`)
    const chunks = await this.ctx.storage.get<string>(keys)
    const parsed = parseJson(keys.map(key => chunks.get(key) ?? '').join(''))
    const result = parsed._tag === 'Ok' ? parseProofResult(parsed.value) : undefined
    if (result?._tag !== 'Ok')
      throw new Error('STORED_RESULT_INVALID')
    return { _tag: 'Finished', result: result.value, modelCalls: state.modelCalls }
  }

  async broker(request: Request): Promise<Response> {
    const credential = credentials(this.env)
    if (!credential)
      return Response.json({ code: 'PROOF_UNCONFIGURED' }, { status: 503 })
    return forwardSandboxRequest(request, {
      ...credential,
      model: this.env.MODEL,
      fetch,
      consumeModelCall: () => this.ctx.blockConcurrencyWhile(async () => {
        const state = await this.status()
        if (state?._tag !== 'Running' || Date.now() - state.startedAt >= JOB_TIMEOUT_MS || state.modelCalls >= MAX_MODEL_CALLS)
          return false
        await this.ctx.storage.put('state', { ...state, modelCalls: state.modelCalls + 1 })
        return true
      }),
    })
  }

  async alarm(): Promise<void> {
    const state = await this.status()
    if (state?._tag !== 'Running')
      return
    const container = this.ctx.container
    if (!container?.running) {
      await this.finishFailure('CONTAINER_LOST', 'Container stopped before returning output.', state.startedAt)
      return
    }
    if (Date.now() - state.startedAt >= JOB_TIMEOUT_MS) {
      await this.finishFailure('DEADLINE_EXCEEDED', 'The Harness reached its duration limit.', state.startedAt)
      return
    }
    const resultFile = await new Files(container).readFile('/job/result.json').catch((cause) => {
      if (SandboxFileError.is(cause) && cause.code === 'ENOENT')
        return undefined
      throw cause
    })
    if (!resultFile) {
      await this.ctx.storage.setAlarm(Date.now() + 10_000)
      return
    }
    const body = await readBoundedBody(resultFile, MAX_RESULT_BYTES)
    const parsed = body === undefined ? undefined : parseJson(body)
    const result = parsed?._tag === 'Ok' ? parseProofResult(parsed.value) : undefined
    if (result?._tag !== 'Ok') {
      await this.finishFailure('INVALID_OUTPUT', 'The sandbox returned invalid output.', state.startedAt)
      return
    }
    await this.storeResult(result.value, state.modelCalls)
    await this.ctx.storage.deleteAlarm()
    await container.destroy()
    await this.releaseLease()
  }

  private async finishFailure(code: 'RUNNER_FAILED' | 'CONTAINER_LOST' | 'DEADLINE_EXCEEDED' | 'INVALID_OUTPUT', detail: string, startedAt: number): Promise<void> {
    const state = await this.status()
    await this.storeResult({ _tag: 'Err', code, detail, elapsedMs: Date.now() - startedAt }, state?.modelCalls ?? 0)
    await this.ctx.storage.deleteAlarm()
    await this.ctx.container?.destroy()
    await this.releaseLease()
  }

  private async releaseLease(): Promise<void> {
    const jobId = await this.ctx.storage.get<string>('jobId')
    if (jobId)
      await this.env.SANDBOX.getByName('proof-gate').release(jobId)
  }

  private async storeResult(result: ProofResult, modelCalls: number): Promise<void> {
    const json = JSON.stringify(result)
    const values: Record<string, string> = {}
    let chunks = 0
    // KV values are limited to 128 KiB. 30,000 UTF-16 units remain below that.
    for (let offset = 0; offset < json.length; offset += 30_000)
      values[`result-${chunks++}`] = json.slice(offset, offset + 30_000)
    await this.ctx.storage.put(values)
    await this.ctx.storage.put('state', { _tag: 'Finished', chunks, modelCalls })
  }
}

export default {
  async fetch(request: Request, env: HarnessEnv): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/github/webhook' && request.method === 'POST')
      return githubWebhook(request, env)
    if (!env.PROOF_TOKEN || !credentials(env))
      return Response.json({ code: 'PROOF_UNCONFIGURED' }, { status: 503 })
    const supplied = new TextEncoder().encode(request.headers.get('authorization') ?? '')
    const expected = new TextEncoder().encode(`Bearer ${env.PROOF_TOKEN}`)
    if (supplied.byteLength !== expected.byteLength || !crypto.subtle.timingSafeEqual(supplied, expected))
      return Response.json({ code: 'UNAUTHORIZED' }, { status: 401 })
    const job = /^\/github\/jobs\/([a-f0-9-]{36})$/.exec(url.pathname)
    const retry = /^\/github\/jobs\/([a-f0-9-]{36})\/retry$/.exec(url.pathname)
    if (retry?.[1] && request.method === 'POST') {
      const result = await env.GITHUB_JOBS.getByName('github-app').retry(retry[1])
      return Response.json(result, { status: result._tag === 'Accepted' ? 202 : 409, headers: { 'cache-control': 'no-store' } })
    }
    if (job?.[1] && request.method === 'GET') {
      const state = await env.GITHUB_JOBS.getByName('github-app').status(job[1])
      return Response.json(state ?? { code: 'NOT_FOUND' }, { status: state ? 200 : 404, headers: { 'cache-control': 'no-store' } })
    }
    if (url.pathname === '/proofs' && request.method === 'POST') {
      const body = await readBoundedBody(request, MAX_REQUEST_BYTES)
      if (body === undefined)
        return Response.json({ code: 'REQUEST_TOO_LARGE' }, { status: 413 })
      const parsed = parseJson(body)
      if (parsed._tag === 'Err')
        return Response.json({ code: parsed.code }, { status: 400 })
      const input = parseProofInput(parsed.value)
      if (input._tag === 'Err')
        return Response.json({ code: input.code }, { status: 400 })
      const id = crypto.randomUUID()
      if (!await env.SANDBOX.getByName('proof-gate').reserve(id))
        return Response.json({ code: 'PROOF_BUSY' }, { status: 409 })
      await env.SANDBOX.getByName(id).start(input.value, id)
      return Response.json({ id }, { status: 202, headers: { 'cache-control': 'no-store' } })
    }
    const match = /^\/proofs\/([a-f0-9-]{36})$/.exec(url.pathname)
    if (match?.[1] && request.method === 'GET') {
      const state = await env.SANDBOX.getByName(match[1]).status()
      return Response.json(state ?? { code: 'NOT_FOUND' }, { status: state ? 200 : 404, headers: { 'cache-control': 'no-store' } })
    }
    return Response.json({ code: 'NOT_FOUND' }, { status: 404 })
  },
}
