import type { UserSession } from '#auth-utils'
import { defineApiHandler } from '#shared/server/handler'
import { identityEmailPatchBodySchema, identityMutationResponseSchema } from '../../../shared/contracts/account'
import { authenticated } from '../../policies/authenticated'
import { planAccountSettings, updateAccountSettings } from '../../utils/account-settings'
import { sendEmailWithEnv } from '../../utils/email'
import { sendSkillValidationSummary } from '../../utils/skill-validation-email'
import { requireUserRow } from '../../utils/users'

export default defineApiHandler({
  schema: identityEmailPatchBodySchema,
  policy: [authenticated],
  response: identityMutationResponseSchema,
  handler: async ({ event, body, platform, session }) => {
    const u = await requireUserRow(event)
    // The schema drops blank addresses, so an opted-in caller can never wipe
    // the stored one here. Absent means unchanged, for every field: an
    // unrelated save must not silently flip `weekly_opt_in`.
    const plan = planAccountSettings(u, {
      email: body.digest_email,
      digest: body.email_opt_in,
      weekly: body.weekly_opt_in,
    })
    if (plan._tag === 'MissingAddress')
      throw createError({ statusCode: 400, message: 'Add a valid email address to receive emails' })
    await updateAccountSettings(platform.db, u.id, plan.columns)
    const config = useRuntimeConfig(event)
    const updated = await requireUserRow(event)
    const summary = sendSkillValidationSummary({
      db: platform.db,
      user: updated,
      now: Math.floor(Date.now() / 1000),
      send: input => sendEmailWithEnv(platform.env, { ...input, from: config.email.from }),
    }).then((outcome) => {
      if (outcome === 'rejected' || outcome === 'uncertain')
        emitOperationalEvent(createWideEvent({ operation: 'skill-validation-email', outcome: 'failed' }))
    }).catch(() => {
      emitOperationalEvent(createWideEvent({ operation: 'skill-validation-email', outcome: 'failed' }))
    })
    const context = (event.context as { cloudflare?: { context?: { waitUntil?: (p: Promise<unknown>) => void } } }).cloudflare?.context
    if (context?.waitUntil)
      context.waitUntil(summary)
    else
      await summary
    const current = session as unknown as UserSession | null
    if (current?.user && (body.email_opt_in !== undefined || body.weekly_opt_in !== undefined)) {
      await setUserSession(event, {
        ...current,
        user: { ...current.user, onboarded: true },
      })
    }
    return { ok: true as const }
  },
})
