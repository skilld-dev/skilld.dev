import { requireUserRow } from '../../utils/users'

export default defineEventHandler(async (event) => {
  const u = await requireUserRow(event)
  return {
    id: u.id,
    login: u.login,
    name: u.name,
    email: u.email,
    avatar: u.avatar,
    digest_email: u.digest_email,
    email_opt_in: !!u.email_opt_in,
    digest_frequency: u.digest_frequency,
    digest_dow: u.digest_dow,
    digest_hour: u.digest_hour,
    timezone: u.timezone,
    stars_synced_at: u.stars_synced_at,
    onboarded_at: u.onboarded_at,
  }
})
