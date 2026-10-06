import type { RunCheckFlag, RunCheckFlagsResponse } from '#shared/run-check-flags'
import type { RunCheckFlagRow } from '../utils/run-check-flags'

/**
 * The reason a run fails, in plain words, for each tag a retry cannot change.
 *
 * Keys are the tags `settleResolution` writes. A source policy failure has no
 * entry: its check summary already names the rule and the file.
 */
const REASONS: Readonly<Record<string, string>> = {
  'CHECK_BLOCKED:credential-material': 'A file in the Skill holds a private key.',
  'CHECK_BLOCKED:path-policy': 'A file path in the Skill is too long for skilld to pack.',
  'SOURCE_NOT_FOUND': 'skilld could not find this Skill on GitHub.',
  'SOURCE_ACCESS_DENIED': 'GitHub denied access to the Repository.',
  'AUTH_REQUIRED': 'The Repository needs a GitHub sign-in.',
  'INVALID_SOURCE': 'GitHub returned a source that skilld could not use.',
  'ARTIFACT_REVOKED': 'skilld withdrew this version of the Skill.',
}

/** Why a flagged run fails, in plain words. */
export function runCheckReason(tag: string, detail: string | null): string {
  const known = REASONS[tag]
  if (known)
    return known
  if (tag === 'CHECK_BLOCKED:source-policy')
    return detail ?? 'The Skill folder breaks a source rule, such as a size limit.'
  if (tag.startsWith('CHECK_BLOCKED:'))
    return 'A required check stopped the run.'
  return `skilld run stopped with the code ${tag}.`
}

const CHECKED_ON = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

export function presentRunCheckFlags(rows: RunCheckFlagRow[]): RunCheckFlagsResponse {
  return {
    items: rows.map((row): RunCheckFlag => ({
      owner: row.owner,
      repository: row.repository,
      name: row.name,
      checkedAt: new Date(row.failedAt * 1000).toISOString(),
      checkedOn: CHECKED_ON.format(row.failedAt * 1000),
      reason: runCheckReason(row.tag, row.detail),
    })),
  }
}
