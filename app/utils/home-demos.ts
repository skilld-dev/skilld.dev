/**
 * The fields the homepage reads from `/api/skill-demos`. Declared here, not
 * imported from the registry layer, so the homepage stays deletion-testable.
 */
export interface HomeDemoItem {
  owner: string
  repo: string
  name: string
  skillPath: string
  /** The Skill author, and the SKILL.md in their Repository (VISION principle 1). */
  authorName: string | null
  sourceUrl: string | null
  prompt: string
  shots: { src: string, width: number, height: number, alt: string, viewport: 'desktop' | 'mobile' }[]
}
