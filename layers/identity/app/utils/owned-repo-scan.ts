import type { IdentityOwnedRepoScanResponse } from '../../shared/contracts/account'

export type OwnedRepoScanNotice
  = | { _tag: 'added', message: string }
    | { _tag: 'none_found', message: string }
    | { _tag: 'retry', message: string }
    | { _tag: 'sign_in', message: string }

function repositories(count: number): string {
  return `${count} ${count === 1 ? 'repository' : 'repositories'}`
}

function addedLine(count: number): string {
  return count > 0 ? `Added Skills from ${repositories(count)}. ` : ''
}

/**
 * Turn one scan result into the line the onboarding prompt shows.
 *
 * A `partial` scan still reports what it added, then asks for a retry so the
 * rest of the results can arrive.
 */
export function ownedRepoScanNotice(result: IdentityOwnedRepoScanResponse): OwnedRepoScanNotice {
  switch (result._tag) {
    case 'auth_failure':
      return { _tag: 'sign_in', message: 'GitHub did not accept your sign-in. Sign in with GitHub again.' }
    case 'rate_limited':
      return { _tag: 'retry', message: 'GitHub limited the check. Try again in a few minutes.' }
    case 'provider_failure':
      return { _tag: 'retry', message: 'GitHub did not answer. Try again later.' }
    case 'partial':
      return {
        _tag: 'retry',
        message: `${addedLine(result.reposSynced)}GitHub did not return every result. Try again later.`,
      }
    case 'complete':
      if (result.reposFound === 0)
        return { _tag: 'none_found', message: 'No SKILL.md files found in your public repositories.' }
      if (result.reposFailed > 0) {
        return {
          _tag: 'retry',
          message: `${addedLine(result.reposSynced)}${repositories(result.reposFailed)} failed. Try again later.`,
        }
      }
      if (result.reposSynced === 0)
        return { _tag: 'none_found', message: `Checked ${repositories(result.reposFound)}. No new Skills to add.` }
      return { _tag: 'added', message: `Added Skills from ${repositories(result.reposSynced)}.` }
  }
}

/**
 * Turn a failed scan request into the line the prompt shows.
 *
 * A 401 means skilld has no usable GitHub token for the account, so the only
 * fix is a new GitHub sign-in.
 */
export function ownedRepoScanFailureNotice(error: unknown): OwnedRepoScanNotice {
  const status = typeof error === 'object' && error !== null
    ? (error as { statusCode?: unknown, status?: unknown }).statusCode ?? (error as { status?: unknown }).status
    : undefined
  if (status === 401)
    return { _tag: 'sign_in', message: 'Your GitHub sign-in expired. Sign in with GitHub again.' }
  return { _tag: 'retry', message: 'Could not check your repositories. Try again.' }
}
