/**
 * Resolve Cloudflare bindings for a Nitro task.
 *
 * Deployed cron handlers pass bindings on the task context. Nitro's local
 * schedule runner uses an empty context, while its Cloudflare dev adapter
 * exposes the same bindings on globalThis.__env__.
 */
export function getTaskEnv(context: unknown): Cloudflare.Env | undefined {
  const taskEnv = (context as {
    cloudflare?: { env?: Cloudflare.Env }
  } | undefined)?.cloudflare?.env

  return taskEnv
    ?? (globalThis as typeof globalThis & {
      __env__?: Cloudflare.Env
    }).__env__
}
