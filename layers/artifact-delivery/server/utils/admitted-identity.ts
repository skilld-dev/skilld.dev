import type { SourceRequest } from '../schemas/contracts'

export interface AdmittedSkillIdentity {
  /** The admitted Skill folder inside the Repository, or `.` for the root. */
  skillPath: string
  /** The commit the Skill page names, or null when the registry has none. */
  commitSha: string | null
}

/** Ask the registry for the identity it admitted under one name; null when it holds none. */
export type FetchAdmittedSkillIdentity = (skill: {
  owner: string
  repository: string
  name: string
}) => Promise<AdmittedSkillIdentity | null>

/**
 * The source a public request resolves: the registry's admitted identity for
 * a name it holds, and the request itself otherwise.
 *
 * The registry names one Skill per name, and the Skill page shows its folder
 * and its source commit. A run of that name resolves exactly that folder at
 * exactly that commit, so nothing in the Repository can disagree with it:
 * copies in Agent folders, a frontmatter name, or the size of the tree.
 *
 * A reference the request names wins over the admitted commit, because the
 * person asked for it. A name the registry does not hold, such as a private
 * Skill, keeps the tree search by name.
 */
export async function admittedSourceRequest(
  source: SourceRequest,
  lookup: FetchAdmittedSkillIdentity,
): Promise<SourceRequest> {
  if (source.selector.type !== 'named-skill')
    return source
  const identity = await lookup({
    owner: source.owner,
    repository: source.repository,
    name: source.selector.name,
  })
  if (!identity)
    return source
  const ref = source.ref ?? (identity.commitSha ? { type: 'commit' as const, value: identity.commitSha } : undefined)
  return {
    provider: source.provider,
    owner: source.owner,
    repository: source.repository,
    selector: { type: 'path', path: identity.skillPath },
    ...(ref ? { ref } : {}),
  }
}
