import type { DigestUser } from '../../utils/digest-select'
import { defineApiHandler } from '#shared/server/handler'
import { canPreviewDigest } from '../../policies/digest-preview'
import { presentDigestPreview } from '../../presenters/digest-preview'
import { digestPreviewSchema } from '../../schemas/digest-preview'
import { previewDigest } from '../../utils/digest-preview'
import { selectDigestForUser } from '../../utils/digest-select'
import { renderDigest } from '../../utils/digest-template'
import { sendEmailWithEnv, signUnsubToken } from '../../utils/email'

export default defineApiHandler({
  schema: digestPreviewSchema,
  policy: canPreviewDigest,
  handler: async ({ event, body, platform }) => {
    setHeader(event, 'Cache-Control', 'private, no-store')
    const config = useRuntimeConfig(event)
    const user = await platform.db.prepare(
      `SELECT id, login, name, digest_email, email, email_opt_in, onboarded_at
       FROM users WHERE login = ?1`,
    ).bind(body.login).first<DigestUser>()
    if (!user)
      throw createError({ statusCode: 404, message: `No user with login ${body.login}` })
    return await previewDigest({
      select: (selectedUser, windowStart, windowEnd) => selectDigestForUser(platform.db, selectedUser, windowEnd, { windowStart }),
      render: renderDigest,
      signUnsubscribe: userId => signUnsubToken(userId, config.tokenKey as string),
      send: input => sendEmailWithEnv(platform.env, { ...input, from: config.email.from }),
    }, user, {
      windowEnd: Math.floor(Date.now() / 1_000),
      siteUrl: (config.publicSiteUrl as string) || 'https://skilld.dev',
      to: body.to,
    })
  },
  presenter: presentDigestPreview,
})
