import { describe, expect, it } from 'vitest'
import { shouldAutoExpandFolder } from '../../layers/registry/app/utils/skill-file-tree'

function folderWith(count: number) {
  return {
    kind: 'dir' as const,
    path: 'references',
    name: 'references',
    children: Array.from({ length: count }, (_, index) => ({
      kind: 'file' as const,
      path: `references/${index}.md`,
      name: `${index}.md`,
    })),
  }
}

describe('folder auto expansion', () => {
  it.each([
    [5, true],
    [6, false],
  ])('starts a folder with %i entries open: %s', (count, expected) => {
    expect(shouldAutoExpandFolder(folderWith(count))).toBe(expected)
  })
})
