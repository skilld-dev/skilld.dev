/** Public navigation only. Article evidence stays in the marketing collection. */
export const WRITING_COMPARISON_LINK = {
  to: '/compare/humanize-writing-skills',
  label: 'Compare Humanizer, Stop Slop, and No AI Slop',
} as const

const featuredWritingSkills = [
  'blader/humanizer/humanizer',
  'hardikpandya/stop-slop/stop-slop',
  'petergyang/no-ai-slop/no-ai-slop',
]

export function comparisonLinkForTrack(slug: string) {
  return slug === 'anti-slop' ? WRITING_COMPARISON_LINK : undefined
}

/** Match exact Skill identity. A shared name alone does not imply editorial coverage. */
export function comparisonLinkForSkill(skill: { owner: string, repo: string, name: string }) {
  const selector = `${skill.owner}/${skill.repo}/${skill.name}`.toLowerCase()
  return featuredWritingSkills.includes(selector) ? WRITING_COMPARISON_LINK : undefined
}
