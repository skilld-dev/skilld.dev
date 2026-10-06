import type { GithubCredential, GithubCredentialConfig, GithubCredentialEnv, GithubCredentialReport } from '#shared/server/github-app-credential'
import type { LoadSourceResult, PublicGithubSourceClient, ResolveSourceResult } from './github-source'
import { parseGithubCredentialConfig } from '#shared/server/github-app-credential'

/**
 * Where public Artifact builds get their GitHub credential: the read App's
 * installation token, then `ARTIFACT_GITHUB_TOKEN`, then `GITHUB_TOKEN`.
 */
export function parseArtifactGithubCredentialConfig(env: GithubCredentialEnv): GithubCredentialConfig {
  return parseGithubCredentialConfig(env, ['ARTIFACT_GITHUB_TOKEN', 'GITHUB_TOKEN'])
}

/**
 * A GitHub source client whose every read asks for the current credential, so
 * a long-lived client never reads with an expired installation token.
 *
 * Some organizations deny the read App on a public Repository that a personal
 * token reads: `neondatabase/agent-skills` answered SOURCE_ACCESS_DENIED to
 * every run on 2026-10-06. A read the App was denied repeats once with the
 * fallback token. Every denial is reported, with or without a fallback.
 */
export function withGithubCredential(
  credential: GithubCredential,
  create: (token: string | undefined) => PublicGithubSourceClient,
  report: (event: GithubCredentialReport) => void,
): PublicGithubSourceClient {
  const read = async <T extends ResolveSourceResult | LoadSourceResult>(
    repository: { owner: string, repository: string },
    run: (client: PublicGithubSourceClient) => Promise<T>,
  ): Promise<T> => {
    const current = await credential.current()
    const first = await run(create(current.token))
    if (!current.isApp || first._tag !== 'rejected' || first.code !== 'SOURCE_ACCESS_DENIED')
      return first
    const fallback = credential.fallback
    report({
      outcome: 'app-denied',
      reason: `GitHub denied the read App for ${repository.owner}/${repository.repository}`,
      fallback: fallback?.name ?? 'none',
    })
    if (fallback)
      return await run(create(fallback.token))
    return {
      ...first,
      summary: 'GitHub denies the skilld.dev read App access to this Repository, and no fallback token is set.',
    }
  }
  return {
    resolve: async request => await read(request, client => client.resolve(request)),
    load: async (source, options) => await read(source, client => client.load(source, options)),
  }
}
