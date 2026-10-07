import type { GithubCredential, GithubCredentialConfig, GithubCredentialEnv, GithubCredentialReport } from '#shared/server/github-app-credential'
import type { LoadSourceResult, PublicGithubSourceClient, ResolveSourceResult } from './github-source'
import { parseGithubCredentialConfig, readWithGithubCredential } from '#shared/server/github-app-credential'

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
 * fallback token. A 401 first repeats with a new installation token. Every
 * use of the fallback is reported, and so is a refusal with no fallback.
 */
export function withGithubCredential(
  credential: GithubCredential,
  fetch: typeof globalThis.fetch,
  create: (token: string | undefined, fetch: typeof globalThis.fetch) => PublicGithubSourceClient,
  report: (event: GithubCredentialReport) => void,
): PublicGithubSourceClient {
  const read = async <T extends ResolveSourceResult | LoadSourceResult>(
    repository: { owner: string, repository: string },
    run: (client: PublicGithubSourceClient) => Promise<T>,
  ): Promise<T> => {
    const settled = await readWithGithubCredential(credential, {
      label: `${repository.owner}/${repository.repository}`,
      send: async (token) => {
        // A rejection code cannot tell a 401, which names the token, from a 403.
        const seen = { unauthorized: false }
        const result = await run(create(token, async (input, init) => {
          const response = await fetch(input, init)
          if (response.status === 401)
            seen.unauthorized = true
          return response
        }))
        return { result, unauthorized: seen.unauthorized }
      },
      refusal: async ({ result, unauthorized }) => {
        if (result._tag !== 'rejected')
          return null
        if (unauthorized)
          return 'unauthorized'
        return result.code === 'SOURCE_ACCESS_DENIED' ? 'denied' : null
      },
      report,
      fallbackOnDenial: true,
    })
    const result = settled.answer.result
    if (settled._tag !== 'refused' || result._tag !== 'rejected')
      return result
    return {
      ...result,
      summary: settled.refusal === 'denied'
        ? 'GitHub denies the skilld.dev read App access to this Repository, and no fallback token is set.'
        : 'GitHub rejected the skilld.dev read App\'s token, and no fallback token is set.',
    }
  }
  return {
    resolve: async request => await read(request, client => client.resolve(request)),
    load: async (source, options) => await read(source, client => client.load(source, options)),
  }
}
