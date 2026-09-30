import type { SkillFileTreeNode } from '../../layers/registry/app/utils/skill-file-tree'
import { describe, expect, it } from 'vitest'
import { buildSkillFileTree } from '../../layers/registry/app/utils/skill-file-tree'

function file(path: string, type: 'markdown' | 'code' = 'markdown') {
  return { path, size: 100, type }
}

function outline(nodes: SkillFileTreeNode[]): string[] {
  return nodes.flatMap(node => node.kind === 'dir'
    ? [`${node.name}/${node.initiallyOpen ? ' (open)' : ''}`, ...outline(node.children).map(line => `  ${line}`)]
    : [node.name])
}

describe('skill file tree', () => {
  it('puts folders first, then SKILL.md, then files, with LICENSE last', () => {
    const tree = buildSkillFileTree([
      file('reference.md'),
      file('LICENSE.txt', 'code'),
      file('scripts/fill.py', 'code'),
      file('agents/grader.md'),
      file('agents/analyzer.md'),
      file('forms.md'),
    ], 7900)

    expect(outline(tree)).toEqual([
      'agents/',
      '  analyzer.md',
      '  grader.md',
      'scripts/',
      '  fill.py',
      'SKILL.md',
      'forms.md',
      'reference.md',
      'LICENSE.txt',
    ])
  })

  it('opens a lone small folder and keeps the rest closed', () => {
    expect(outline(buildSkillFileTree([file('references/a.md'), file('references/b.md')], 0))).toEqual([
      'references/ (open)',
      '  a.md',
      '  b.md',
      'SKILL.md',
    ])
    const many = Array.from({ length: 6 }, (_, index) => file(`rules/${index}.md`))
    expect(outline(buildSkillFileTree(many, 0))[0]).toBe('rules/')
    expect(outline(buildSkillFileTree([file('a/x.md'), file('b/y.md')], 0))).toEqual(['a/', '  x.md', 'b/', '  y.md', 'SKILL.md'])
  })

  it('sorts nested folders the same way and carries SKILL.md size', () => {
    const tree = buildSkillFileTree([file('docs/z.md'), file('docs/api/a.md')], 7900)

    expect(outline(tree)).toEqual(['docs/ (open)', '  api/ (open)', '    a.md', '  z.md', 'SKILL.md'])
    expect(tree.at(-1)).toMatchObject({ kind: 'file', asset: { path: 'SKILL.md', size: 7900 } })
  })
})
