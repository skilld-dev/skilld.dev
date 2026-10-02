import type { PreparedTag } from './github-client'
import type { TagRequest } from './github-events'
import { DurableObject } from 'cloudflare:workers'
import { githubInstallationClient, prepareTag, publishSkill } from './github-client'

type Outcome = Awaited<ReturnType<typeof publishSkill>> | { _tag: 'Skipped', reason: string } | { _tag: 'Failed', code: string, detail: string }
interface Job { id: string, request: TagRequest, receivedAt: number }
type State = Job & (
  { _tag: 'Queued' }
  | { _tag: 'Ready' | 'Generating' | 'Publishing', context: PreparedTag }
  | { _tag: 'Finished', outcome: Outcome }
)

export class GithubJobs extends DurableObject<HarnessEnv> {
  async enqueue(request: TagRequest): Promise<{ _tag: 'Accepted', id: string } | { _tag: 'Busy' }> {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([request.installationId, request.repositoryId, request.tag])))
    const key = `event-${Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')}`
    const result = await this.ctx.storage.transaction(async (storage) => {
      const previous = await storage.get<string>(key)
      if (previous)
        return { _tag: 'Accepted' as const, id: previous }
      const queue = await storage.get<string[]>('queue') ?? []
      if (queue.length >= 64)
        return { _tag: 'Busy' as const }
      const id = crypto.randomUUID()
      await storage.put(key, id)
      await storage.put<State>(`job-${id}`, { _tag: 'Queued', id, request, receivedAt: Date.now() })
      await storage.put('queue', [...queue, id])
      await storage.setAlarm(Date.now() + 1000)
      return { _tag: 'Accepted' as const, id }
    })
    if (result._tag === 'Accepted') {
      // Operators use this event to locate installation jobs in Worker logs.
      // eslint-disable-next-line no-console
      console.info('github-app-job-accepted', { id: result.id, repository: `${request.owner}/${request.name}`, tag: request.tag })
    }
    return result
  }

  async status(id: string): Promise<unknown> {
    const job = await this.ctx.storage.get<State>(`job-${id}`)
    if (!job)
      return null
    // The operator gets outcomes and source identity, without baseline file contents.
    return { id: job.id, request: job.request, receivedAt: job.receivedAt, _tag: job._tag, ...(job._tag === 'Finished' ? { outcome: job.outcome } : {}) }
  }

  async alarm(): Promise<void> {
    const queue = await this.ctx.storage.get<string[]>('queue') ?? []
    const id = queue[0]
    if (!id)
      return
    await this.ctx.storage.setAlarm(Date.now() + 10_000)
    const state = await this.ctx.storage.get<State>(`job-${id}`)
    if (!state)
      throw new Error('APP_JOB_STATE_MISSING')
    if (state._tag === 'Finished') {
      await this.ctx.storage.transaction(async (storage) => {
        const current = await storage.get<string[]>('queue') ?? []
        await storage.put('queue', current.filter(value => value !== id))
      })
      return
    }
    if (Date.now() - state.receivedAt > 30 * 60 * 1000) {
      await this.finish(state, { _tag: 'Failed', code: 'APP_JOB_DEADLINE', detail: 'The job exceeded thirty minutes.' })
      return
    }
    await this.advance(state).catch(async (cause: unknown) => {
      const detail = cause instanceof Error ? cause.message : String(cause)
      console.error('github-app-job-failed', { id, stage: state._tag, detail: detail.slice(0, 1000) })
      await this.finish(state, { _tag: 'Failed', code: 'APP_JOB_FAILED', detail: detail.slice(0, 1000) })
    })
  }

  private async client(state: Job) {
    return githubInstallationClient({ appId: this.env.GITHUB_APP_ID, privateKey: this.env.GITHUB_APP_PRIVATE_KEY_PKCS8, installationId: state.request.installationId, repositoryId: state.request.repositoryId, fetch, now: Date.now })
  }

  private async advance(state: Exclude<State, { _tag: 'Finished' }>): Promise<void> {
    if (state._tag === 'Queued') {
      const prepared = await prepareTag(state.request, await this.client(state), fetch)
      if (prepared._tag === 'Pending')
        return
      if (prepared._tag === 'Skipped') {
        await this.finish(state, prepared)
        return
      }
      const key = `target-${state.request.repositoryId}-${prepared.value.targetSha}`
      const previous = await this.ctx.storage.get<string>(key)
      if (previous && previous !== state.id) {
        await this.finish(state, { _tag: 'Skipped', reason: 'TARGET_ALREADY_PROCESSED' })
        return
      }
      await this.ctx.storage.put(key, state.id)
      await this.ctx.storage.put<State>(`job-${state.id}`, { ...state, _tag: 'Ready', context: prepared.value })
      return
    }
    const sandbox = this.env.SANDBOX.getByName(state.id)
    if (state._tag === 'Ready') {
      // Reuse the known container ID after an alarm retry. Never create a second generation job.
      if (!await sandbox.status()) {
        if (!await this.env.SANDBOX.getByName('proof-gate').reserve(state.id))
          return
        await sandbox.start(state.context.input, state.id)
      }
      await this.ctx.storage.put<State>(`job-${state.id}`, { ...state, _tag: 'Generating' })
      return
    }
    const generated = await sandbox.status()
    if (generated?._tag !== 'Finished')
      return
    if (generated.result._tag === 'Err') {
      await this.finish(state, { _tag: 'Failed', code: generated.result.code, detail: generated.result.detail })
      return
    }
    if (state._tag === 'Generating') {
      await this.ctx.storage.put<State>(`job-${state.id}`, { ...state, _tag: 'Publishing' })
      return
    }
    // Mint a fresh, single-repository installation token before any publication.
    const result = await publishSkill(state.context, generated.result.files, await this.client(state))
    await this.finish(state, result)
  }

  private async finish(state: Job, outcome: Outcome): Promise<void> {
    await this.ctx.storage.put<State>(`job-${state.id}`, { id: state.id, request: state.request, receivedAt: state.receivedAt, _tag: 'Finished', outcome })
  }
}
