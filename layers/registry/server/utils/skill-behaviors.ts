import type { Behavior, BehaviorLocation } from 'skilld-protocol/behaviors'
import { detectBehaviors } from 'skilld-protocol/behaviors'
import { githubSkillFileUrl } from '#shared/skill-file-url'

export type SkillPageBehavior = Omit<Behavior, 'locations'> & {
  locations: Array<BehaviorLocation & { url: string | null }>
}

/**
 * The Skill behaviors a Skill page can show.
 *
 * The page holds SKILL.md and the file names the sync stored, never supporting
 * file content, so only those inputs reach the shared rules. `skilld run`
 * applies the same rules to every file.
 */
export function skillPageBehaviors(input: {
  raw: string | null
  assetPaths: readonly string[]
  source: { owner: string, repo: string, branch: string | null, skillPath: string | null }
}): SkillPageBehavior[] {
  const files = [
    ...(input.raw === null ? [] : [{ path: 'SKILL.md', text: input.raw }]),
    ...input.assetPaths.map(path => ({ path })),
  ]
  const directory = input.source.skillPath?.replace(/(?:^|\/)SKILL\.md$/, '') ?? null
  const url = (location: BehaviorLocation): string | null => {
    if (directory === null)
      return null
    const file = githubSkillFileUrl({
      owner: input.source.owner,
      repo: input.source.repo,
      skillPath: directory ? `${directory}/${location.path}` : location.path,
      branch: input.source.branch,
    })
    if (!file || location.line === null)
      return file
    // GitHub renders Markdown, and a line anchor only works on its source view.
    return /\.(?:md|mdx|markdown)$/i.test(location.path) ? `${file}?plain=1#L${location.line}` : `${file}#L${location.line}`
  }
  return detectBehaviors(files).map(behavior => ({
    ...behavior,
    locations: behavior.locations.map(location => ({ ...location, url: url(location) })),
  }))
}
