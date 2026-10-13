import type { TagProfile } from '#layers/registry/server/api/tags/[slug].get'

export type FrameworkDirectoryProfile = Omit<TagProfile, 'skills'> & {
  skills: Pick<TagProfile['skills'][number], 'owner' | 'repo' | 'name' | 'registryPath' | 'description' | 'stars' | 'authorName'>[]
}

/** The directory keeps every result and only the fields its cards read. */
export function frameworkDirectory(profile: TagProfile): FrameworkDirectoryProfile {
  return {
    ...profile,
    skills: profile.skills.map(({ owner, repo, name, registryPath, description, stars, authorName }) => ({
      owner,
      repo,
      name,
      registryPath,
      description,
      stars,
      authorName,
    })),
  }
}
