import type { HandlerCtx } from '#shared/server/handler'

export async function canPreviewDigest({ event }: HandlerCtx<unknown>): Promise<boolean> {
  await requireAdmin(event)
  return true
}
