import { describe, expect, it } from 'vitest'
import { selectSkillFiles, SKILL_FILE_LIMIT } from '../../shared/skill-files'

describe('skill file selection', () => {
  it('bounds a large file tree and reports the full count', () => {
    const files = Array.from({ length: SKILL_FILE_LIMIT + 1 }, (_, index) => ({
      path: `references/${index}.md`,
      size: index,
      type: 'markdown' as const,
    }))

    expect(selectSkillFiles(files)).toEqual({
      files: files.slice(0, SKILL_FILE_LIMIT),
      total: SKILL_FILE_LIMIT + 1,
    })
  })
})
