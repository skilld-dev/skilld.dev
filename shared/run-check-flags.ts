/**
 * The run check flag, as artifact delivery answers it at
 * `GET /api/run-checks/flags`.
 *
 * A flagged Skill failed its last two run checks for a reason a retry cannot
 * change. Its Skill page keeps the run command and flags it. The curated
 * surfaces leave the Skill out while the flag stands.
 */
export interface RunCheckFlag {
  owner: string
  repository: string
  name: string
  /** ISO 8601 time the last failing check settled. */
  checkedAt: string
  /** The same time as a UTC date, such as `7 Oct 2026`. */
  checkedOn: string
  /** Why the run failed, in plain words. */
  reason: string
}

export interface RunCheckFlagsResponse {
  items: RunCheckFlag[]
}

/**
 * One key per Skill, without regard to case, so a route that names a Skill
 * with other casing still matches its flag.
 */
export function runCheckFlagKey(owner: string, repository: string, name: string): string {
  return `${owner}/${repository}/${name}`.toLowerCase()
}
