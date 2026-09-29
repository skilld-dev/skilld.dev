/** A Skill is a directory with this file. */
export const SKILL_FILE = 'SKILL.md'

/**
 * Folders whose SKILL.md files are test inputs, not published Skills.
 *
 * harlan-zw/nuxt-ai-ready ships one Skill beside fixtures in
 * `test/fixtures/agent-skills/skills/`. Counting those fixtures moved its one
 * Skill off the repository URL. Measured in production on 2026-09-29, these
 * folders held 180 resolved Skills across 36 Repositories, none with a like.
 *
 * `examples`, `samples` and `testing` stay out on purpose. The same measurement
 * found 139 resolved Skills under them, 48 indexable, and many are real Skills
 * that a Repository keeps in an example folder.
 */
const NON_SKILL_FOLDERS: ReadonlySet<string> = new Set([
  '__fixtures__',
  '__tests__',
  'e2e',
  'fixture',
  'fixtures',
  'node_modules',
  'test',
  'testdata',
  'tests',
])

/**
 * True when a Git tree path is a SKILL.md the registry indexes.
 *
 * Every discovery path uses this one predicate, so the Skill count behind the
 * canonical URL and the synced set agree. Only the parent folders decide: a
 * Skill named `test` at `skills/test/SKILL.md` is a real Skill.
 */
export function isRegistrySkillPath(path: string): boolean {
  const segments = path.split('/')
  if (segments.at(-1) !== SKILL_FILE)
    return false
  return !segments
    .slice(0, -2)
    .some(segment => NON_SKILL_FOLDERS.has(segment.toLowerCase()))
}
