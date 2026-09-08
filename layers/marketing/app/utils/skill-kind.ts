import { z } from 'zod'

export const skillKindSchema = z.enum(['package', 'project'])
export type SkillKind = z.infer<typeof skillKindSchema>

export const skillKinds = {
  package: {
    label: 'A package you publish',
    detail: 'Help agents use your npm, PyPI, crates.io, Go, or RubyGems package.',
    icon: 'i-lucide-package',
    to: { path: '/make-skill', query: { kind: 'package' } },
  },
  project: {
    label: 'A project you maintain',
    detail: 'Help agents work in one repository: its commands, conventions, and workflows.',
    icon: 'i-lucide-folder-git-2',
    to: '/learn/author-project-skills',
  },
} as const

export const projectSkillSource = 'https://raw.githubusercontent.com/skilld-dev/skilld/main/skills/generate-project-skill/SKILL.md'

export const projectSkillPrompt = [
  `Read ${projectSkillSource}.`,
  'Draft a Skill for this project using this repository.',
  'Read the project instructions, the manifests, and the test, lint, build, and release commands.',
  'Show the draft for review before replacing existing Skills.',
].join('\n\n')
