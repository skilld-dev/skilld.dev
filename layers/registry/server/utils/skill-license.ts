import type { FetchOutcome, GithubBindings } from './github-client'
import { z } from 'zod'
import { getGithubJson } from './github-client'

const RepositoryLicenseSchema = z.object({ license: z.object({ spdx_id: z.string() }).nullable() })

export type RepositoryLicense
  = | { _tag: 'known', license: string }
    | { _tag: 'missing' }
    | { _tag: 'unavailable', status: number }

/** Only a root Skill inherits the Repository license. Nested Skills may have their own terms. */
export async function readRepositoryLicense(
  source: { owner: string, repo: string, commit: string },
  bindings: GithubBindings,
  read: (path: `/${string}`, bindings: GithubBindings) => Promise<FetchOutcome<unknown>> = getGithubJson,
): Promise<RepositoryLicense> {
  const answer = await read(`/repos/${source.owner}/${source.repo}/license?ref=${encodeURIComponent(source.commit)}`, bindings)
  if (answer.status === 404)
    return { _tag: 'missing' }
  if (!answer.data)
    return { _tag: 'unavailable', status: answer.status }
  const parsed = RepositoryLicenseSchema.safeParse(answer.data)
  if (!parsed.success)
    return { _tag: 'unavailable', status: 502 }
  const license = parsed.data.license?.spdx_id.trim()
  return !license || license === 'NOASSERTION'
    ? { _tag: 'missing' }
    : { _tag: 'known', license }
}
