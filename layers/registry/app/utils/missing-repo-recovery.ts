export type MissingRepoDecision
  = | { _tag: 'not_found' }
    | { _tag: 'redirect', location: string }

/**
 * Recover `/gh/<owner>/<skill>` when the middle segment is missing.
 *
 * A skill lives at `/gh/<owner>/<repo>/<name>`. People linking to one routinely
 * drop the repo, because the owner and the skill are the two parts they can
 * name. The result is a URL that looks plausible and 404s: an inbound link from
 * csdn.net pointed at `/gh/mattpocock/grill-me`, while the skill sits at
 * `/gh/mattpocock/skills/grill-me`.
 *
 * Only an unambiguous match redirects. If two repositories under one owner both
 * publish a skill by that name, guessing would send readers to the wrong one,
 * so the 404 stands.
 */
export function resolveMissingRepoRedirect(input: {
  owner: string
  repo: string
  skills: readonly { repo: string, name: string }[]
}): MissingRepoDecision {
  const { owner, repo, skills } = input
  if (!owner || !repo)
    return { _tag: 'not_found' }

  const wanted = repo.toLowerCase()
  const matches = skills.filter(skill => skill.name.toLowerCase() === wanted)
  const repos = new Set(matches.map(match => match.repo))
  const match = matches[0]
  if (!match || repos.size !== 1)
    return { _tag: 'not_found' }

  return {
    _tag: 'redirect',
    location: `/gh/${owner}/${match.repo}/${match.name}`,
  }
}
