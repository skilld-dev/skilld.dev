import type { H3Event } from 'h3'
import type { SkillImagePolicy } from './skill-md-render'
import { createWideEvent } from '@harlan-zw/nuxt-wide-events/standalone'
import { resolveImageProxyKey, signImageProxyUrl } from '#server/utils/image-proxy'
import { emitOperationalEvent } from '#server/utils/operational-event'

/**
 * The image policy for a SKILL.md render served in a request. Without the
 * proxy secret, images fall back to links so no visitor loads a third-party image.
 */
export async function skillImagePolicyForEvent(event: H3Event): Promise<SkillImagePolicy> {
  const key = await resolveImageProxyKey(event.context.platform?.env)
  if (!key) {
    emitOperationalEvent(createWideEvent({ operation: 'image-proxy-key', outcome: 'missing' }))
    return { _tag: 'link' }
  }
  return { _tag: 'proxy', proxyUrl: href => signImageProxyUrl(key, href) }
}
