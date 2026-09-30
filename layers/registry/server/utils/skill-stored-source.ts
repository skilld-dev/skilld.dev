import type { RepoIdentity } from './repo-source-identity'
import type { UpstreamText } from './upstream-text'
import { selectSkillFiles } from '#shared/skill-files'
import { resolveRepoSourceIdentityFromRow } from './repo-source-identity'

/**
 * What the sync stored for one Skill. The request path for `skills-raw` and
 * `skill-files` reads this and nothing else, so a GitHub outage cannot reach
 * the run surface or the file explorer. Freshness is "as of the last sync".
 */
export interface StoredSkillRow {
  default_branch: string | null
  source_owner: string | null
  source_repo: string | null
  source_resolved: number | null
  rendered_status: string | null
  rendered_raw: string | null
  rendered_skill_path: string | null
  /** JSON array of `{ path, size, type }`, written by the sync. */
  assets: string | null
}

export type SkillFileType = 'markdown' | 'code' | 'image' | 'data' | 'other'

export interface SkillFile {
  path: string
  size: number
  type: SkillFileType
}

export interface SkillFilesPayload {
  skillPath: string | null
  branch: string
  files: SkillFile[]
  total: number
}

export async function loadStoredSkillRow(
  db: D1Database,
  skill: RepoIdentity & { name: string },
): Promise<StoredSkillRow | null> {
  return db
    .prepare(`
      SELECT r.default_branch, r.source_owner, r.source_repo,
             s.source_resolved, s.rendered_status, s.rendered_raw, s.rendered_skill_path, s.assets
      FROM skills s JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
      WHERE s.owner = ? AND s.repo = ? AND s.name = ?
    `)
    .bind(skill.owner, skill.repo, skill.name)
    .first<StoredSkillRow>()
}

export type StoredSkillMd
  = | { _tag: 'ok', body: string, source: string }
    | { _tag: 'gone' }
    | { _tag: 'missing' }

/**
 * The SKILL.md as of the last sync. A gone verdict wins over a stored body:
 * the page serves a 410 tombstone on the same verdict.
 */
export function readStoredSkillMd(skill: RepoIdentity, row: StoredSkillRow): StoredSkillMd {
  if (row.source_resolved === 0)
    return { _tag: 'gone' }
  if (row.rendered_status !== 'ok' || !row.rendered_raw || !row.rendered_skill_path)
    return { _tag: 'missing' }
  const source = resolveRepoSourceIdentityFromRow(skill, row)
  return {
    _tag: 'ok',
    body: row.rendered_raw,
    source: `${source.owner}/${source.repo}@${row.default_branch || 'main'}/${row.rendered_skill_path}`,
  }
}

function isSkillFileType(value: unknown): value is SkillFileType {
  return value === 'markdown' || value === 'code' || value === 'image' || value === 'data' || value === 'other'
}

/**
 * Parse the sync's `assets` column once. A malformed entry is dropped; a
 * malformed column is an empty list, because the sync rewrites it on change.
 */
export function parseStoredAssets(assets: string | null): SkillFile[] {
  if (!assets)
    return []
  let parsed: unknown
  try {
    parsed = JSON.parse(assets)
  }
  catch {
    // A corrupt column reads as no files; the next sync rewrites it.
    return []
  }
  if (!Array.isArray(parsed))
    return []
  return parsed.flatMap((entry: unknown): SkillFile[] => {
    if (typeof entry !== 'object' || entry === null)
      return []
    const { path, size, type } = entry as Record<string, unknown>
    if (typeof path !== 'string')
      return []
    return [{
      path,
      size: typeof size === 'number' ? size : 0,
      type: isSkillFileType(type) ? type : 'other',
    }]
  })
}

export type StoredSkillFiles
  = | { _tag: 'ok', payload: SkillFilesPayload }
    | { _tag: 'gone' }

/**
 * The file list as of the last sync. A Skill whose SKILL.md sits at the
 * repository root has no stored assets, so its list is empty but its
 * `skillPath` is set. A Skill with no resolved SKILL.md has `skillPath: null`.
 */
export function readStoredSkillFiles(row: StoredSkillRow): StoredSkillFiles {
  if (row.source_resolved === 0)
    return { _tag: 'gone' }
  const branch = row.default_branch || 'main'
  if (row.rendered_status !== 'ok' || !row.rendered_skill_path)
    return { _tag: 'ok', payload: { skillPath: null, branch, files: [], total: 0 } }
  const selected = selectSkillFiles(parseStoredAssets(row.assets))
  return {
    _tag: 'ok',
    payload: { skillPath: row.rendered_skill_path, branch, files: selected.files, total: selected.total },
  }
}

export type ReferencedFileTarget
  = | { _tag: 'ok', url: string, path: string, source: string }
    | { _tag: 'missing' }

/**
 * Where a file beside SKILL.md lives upstream. Only the file body needs
 * GitHub: its directory comes from the stored SKILL.md path, so the ungh tree
 * read is gone.
 */
export function resolveReferencedFileTarget(
  skill: RepoIdentity,
  row: StoredSkillRow,
  filePath: string,
): ReferencedFileTarget {
  if (!row.rendered_skill_path)
    return { _tag: 'missing' }
  const source = resolveRepoSourceIdentityFromRow(skill, row)
  const branch = row.default_branch || 'main'
  const skillDir = row.rendered_skill_path.replace(/(?:^|\/)skill\.md$/i, '')
  const path = skillDir ? `${skillDir}/${filePath}` : filePath
  return {
    _tag: 'ok',
    path,
    source: `${source.owner}/${source.repo}@${branch}/${path}`,
    url: `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${branch}/${path}`,
  }
}

export type ReferencedFileRead
  = | { _tag: 'ok', body: string }
    | { _tag: 'missing' }
    | { _tag: 'unavailable', status: number | null, attempts: number }

/**
 * Read one referenced file. The text reader is a dependency, so a test proves
 * which reads happen and the handler passes the real one.
 */
export async function readReferencedFile(
  target: Extract<ReferencedFileTarget, { _tag: 'ok' }>,
  fetchText: (url: string) => Promise<UpstreamText>,
): Promise<ReferencedFileRead> {
  const raw = await fetchText(target.url)
  return raw._tag === 'ok' ? { _tag: 'ok', body: raw.body } : raw
}
