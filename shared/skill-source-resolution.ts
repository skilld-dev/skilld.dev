/**
 * Whether a skill's source file is still really there.
 *
 * TWO DIFFERENT QUESTIONS, AND ONLY ONE OF THEM IS THIS ONE. The render
 * describes a cached copy, which outlives the file being deleted upstream, so
 * it can only ever answer "we can still draw this". The sync's stored
 * `source_resolved` is the verdict on whether the file exists.
 *
 * Reading only the render reported `resolved: true` for skills whose SKILL.md
 * had been 404 for months, `microsoft/skills/entra-app-registration` among
 * them. Both have to agree before this says yes.
 */
export interface SkillSourceInput {
  /** The sync's verdict. `0` means gone; null means never synced, not gone. */
  sourceResolved: number | null | undefined
  renderStatus: string
  skillPath: string | null | undefined
  raw: string | null | undefined
}

export function isSourceResolved(input: SkillSourceInput): boolean {
  // Only an explicit 0 is a claim that the file is gone. Absence of a verdict
  // is not a verdict of absence.
  const sourceGone = input.sourceResolved === 0
  return !sourceGone
    && Boolean(input.renderStatus === 'ok' && input.skillPath && input.raw)
}
