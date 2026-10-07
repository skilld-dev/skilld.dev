/**
 * Whether GitHub refused a read for want of quota.
 *
 * A read GitHub denied the read App also answers 403, but it is a fact about
 * one Repository: `denied` marks it, and it never pauses the sync. It lives
 * apart from the GitHub client, which sync tests replace whole.
 */
export function githubRateLimited(outcome: { status: number, denied?: true }): boolean {
  return (outcome.status === 403 || outcome.status === 429) && !outcome.denied
}
