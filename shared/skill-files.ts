export const SKILL_FILE_LIMIT = 250

function depthOf(path: string): number {
  let depth = 0
  for (const char of path) {
    if (char === '/')
      depth++
  }
  return depth
}

/**
 * Bounds a skill's file list to SKILL_FILE_LIMIT and reports the full count.
 * The upstream tree is sorted by path, so a plain slice of a root SKILL.md's
 * whole-repo listing kept deep `.github/` noise and dropped top-level files
 * like README.md. Over the limit, shallower paths win (ties keep tree order),
 * and the kept files come back in their original tree order.
 */
export function selectSkillFiles<T extends { path: string }>(files: readonly T[]): { files: T[], total: number } {
  if (files.length <= SKILL_FILE_LIMIT)
    return { files: [...files], total: files.length }

  const kept = files
    .map((file, index) => ({ index, depth: depthOf(file.path) }))
    .sort((a, b) => a.depth - b.depth || a.index - b.index)
    .slice(0, SKILL_FILE_LIMIT)
    .map(entry => entry.index)
    .sort((a, b) => a - b)

  return {
    files: kept.map(index => files[index]!),
    total: files.length,
  }
}
