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

const SLUGIFY_STRIP_RE = /[^a-z0-9-]+/g
const SLUGIFY_DEDUPE_DASH_RE = /-+/g
const SLUGIFY_TRIM_DASH_RE = /^-+|-+$/g

/**
 * The registry Skill name for a folder name, or for the Repository name when
 * the Skill sits at the root.
 *
 * The registry admits a Skill under this name, and delivery finds a Skill by
 * it, so both read it from this one function. Delivery used to compare the raw
 * folder name: `better-auth/emailAndPassword` was listed as `emailandpassword`
 * and no run could find it.
 */
export function slugifySkillName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(SLUGIFY_STRIP_RE, '')
    .replace(SLUGIFY_DEDUPE_DASH_RE, '-')
    .replace(SLUGIFY_TRIM_DASH_RE, '')
}

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

/**
 * The canonical copy among Skill folders that share one name, or null for none.
 *
 * Repositories copy one Skill into many places: Agent folders such as
 * `.claude/skills/x` and `.cursor/skills/x`, and plugin mirrors such as
 * `plugins/x/skills/x`. Measured 2026-10-07: pbakaus/impeccable has 20 copies,
 * freshtechbro/claudedesignskills has 4. Each copy is the same Skill to its
 * author, so a name must pick one copy, the same one every time.
 *
 * Folders are directories relative to the Repository root, with `.` for the
 * root. The order is a total order, so the input order never matters:
 *
 * 1. A folder with no hidden segment wins. Hidden folders are Agent targets.
 * 2. Fewer segments win. The root has none.
 * 3. Code unit order decides the rest.
 */
export function canonicalSkillFolder(folders: readonly string[]): string | null {
  const ranked = [...new Set(folders)].sort(compareSkillFolders)
  return ranked[0] ?? null
}

/**
 * The canonical SKILL.md path of each Skill name, in input order.
 *
 * `paths` are SKILL.md paths from one Repository tree. `nameOf` names the
 * Skill in a folder, with `.` for the root. Copies that share a name keep the
 * one {@link canonicalSkillFolder} picks, the folder `skilld run` resolves by
 * name, so the registry admits the same copy every sync.
 */
export function canonicalSkillPaths(paths: readonly string[], nameOf: (folder: string) => string): string[] {
  const foldersByName = new Map<string, string[]>()
  for (const path of paths) {
    const folder = skillFolderOf(path)
    const name = nameOf(folder)
    foldersByName.set(name, [...(foldersByName.get(name) ?? []), folder])
  }
  const canonical = new Set([...foldersByName.values()].map(canonicalSkillFolder))
  return paths.filter(path => canonical.has(skillFolderOf(path)))
}

function skillFolderOf(path: string): string {
  return path === SKILL_FILE ? '.' : path.slice(0, -`/${SKILL_FILE}`.length)
}

function compareSkillFolders(left: string, right: string): number {
  const leftSegments = left === '.' ? [] : left.split('/')
  const rightSegments = right === '.' ? [] : right.split('/')
  const hidden = Number(leftSegments.some(isHiddenSegment)) - Number(rightSegments.some(isHiddenSegment))
  if (hidden !== 0)
    return hidden
  if (leftSegments.length !== rightSegments.length)
    return leftSegments.length - rightSegments.length
  return left < right ? -1 : left > right ? 1 : 0
}

function isHiddenSegment(segment: string): boolean {
  return segment.startsWith('.')
}

/**
 * A Markdown link into `.skilld/`, the local cache folder skilld v2 made.
 *
 * `./.skilld/` is the form the CLI wrote. A bare `.skilld/` link is the same
 * folder. A link into a nested `docs/.skilld/` is not.
 */
const SKILLD_CACHE_LINK = /\]\((?:\.\/)?\.skilld\//

/**
 * True when SKILL.md content is a skilld cache Skill, not a Skill the
 * Repository wrote.
 *
 * skilld v2 generated a Skill per dependency, linked it to a gitignored
 * `.skilld/` folder, and told projects to commit the SKILL.md. The committed
 * copy repeats another package's docs and its links are dead. Ejected Skills
 * that a Repository publishes on purpose link `./references/` instead, so the
 * link is the marker.
 *
 * Measured in production on 2026-09-29, over resolved Skills:
 *
 * - `.skilld/` link: 8 rows, all cache Skills, including 3 from before the
 *   `-skilld` suffix and `metadata.generated_at` existed.
 * - `-skilld` name suffix: 37 rows, 33 of them published Skills in
 *   skilld-dev/vue-ecosystem-skills. harlan-zw/nuxt-seo also has a hand-written
 *   `devtools-layer-skilld`.
 * - `metadata.generated_at`: 5 rows. It misses the older cache Skills, and
 *   ejected Skills carry it too.
 *
 * The tree lists paths only, so this needs the blob. The sync reads the blob
 * before it admits a Skill, which keeps cache Skills out of the resolved count
 * behind the canonical URL.
 */
export function isSkilldCacheSkill(raw: string): boolean {
  return SKILLD_CACHE_LINK.test(raw)
}
