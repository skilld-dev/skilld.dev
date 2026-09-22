import type { IdentityOwnedRepoScanResponse } from '../../layers/identity/shared/contracts/account'
import { describe, expect, it } from 'vitest'
import { ownedRepoScanFailureNotice, ownedRepoScanNotice } from '../../layers/identity/app/utils/owned-repo-scan'

function result(overrides: Partial<IdentityOwnedRepoScanResponse>): IdentityOwnedRepoScanResponse {
  return { _tag: 'complete', reposFound: 0, reposSynced: 0, reposFailed: 0, ...overrides }
}

describe('owned repository scan notice', () => {
  it.each([
    [result({ reposFound: 2, reposSynced: 2 }), { _tag: 'added', message: 'Added Skills from 2 repositories.' }],
    [result({ reposFound: 1, reposSynced: 1 }), { _tag: 'added', message: 'Added Skills from 1 repository.' }],
    [result({}), { _tag: 'none_found', message: 'No SKILL.md files found in your public repositories.' }],
    [result({ reposFound: 3 }), { _tag: 'none_found', message: 'Checked 3 repositories. No new Skills to add.' }],
    [result({ reposFound: 3, reposSynced: 2, reposFailed: 1 }), { _tag: 'retry', message: 'Added Skills from 2 repositories. 1 repository failed. Try again later.' }],
    [result({ _tag: 'partial', reposFound: 1 }), { _tag: 'retry', message: 'GitHub did not return every result. Try again later.' }],
    [result({ _tag: 'rate_limited' }), { _tag: 'retry', message: 'GitHub limited the check. Try again in a few minutes.' }],
    [result({ _tag: 'auth_failure' }), { _tag: 'sign_in', message: 'GitHub did not accept your sign-in. Sign in with GitHub again.' }],
  ])('describes %j', (input, expected) => {
    expect(ownedRepoScanNotice(input)).toEqual(expected)
  })

  it('asks for a new sign-in when the scan request returns 401', () => {
    expect(ownedRepoScanFailureNotice(Object.assign(new Error('x'), { statusCode: 401 })))
      .toMatchObject({ _tag: 'sign_in' })
  })

  it('offers a retry for any other failed request', () => {
    expect(ownedRepoScanFailureNotice(new Error('network down'))).toMatchObject({ _tag: 'retry' })
  })
})
