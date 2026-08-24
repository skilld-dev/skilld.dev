export const SKILL_FILE_LIMIT = 250

export function selectSkillFiles<T>(files: readonly T[]): { files: T[], total: number } {
  return {
    files: files.slice(0, SKILL_FILE_LIMIT),
    total: files.length,
  }
}
