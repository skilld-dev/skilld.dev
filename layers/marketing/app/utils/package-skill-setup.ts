import { z } from 'zod'

export const packageManagerSchema = z.enum(['npm', 'pnpm', 'yarn', 'bun'])

const packageNameSchema = z.string().trim().min(1).max(214).regex(/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/)

export type PackageManager = z.infer<typeof packageManagerSchema>

export interface PackageSkillSetup {
  manager: PackageManager
  package: string
}

type SetupResult
  = | { _tag: 'Ok', value: PackageSkillSetup }
    | { _tag: 'Err', field: 'manager' | 'package', message: string }

export function parsePackageSkillSetup(input: { manager?: unknown, package?: unknown }): SetupResult {
  const manager = packageManagerSchema.safeParse(input.manager)
  if (!manager.success)
    return { _tag: 'Err', field: 'manager', message: 'Choose npm, pnpm, Yarn, or Bun.' }

  const name = packageNameSchema.safeParse(input.package)
  if (!name.success) {
    return {
      _tag: 'Err',
      field: 'package',
      message: 'Enter a package name, such as vue or @nuxt/ui, without a version or URL.',
    }
  }

  return { _tag: 'Ok', value: { manager: manager.data, package: name.data } }
}

const runners: Record<PackageManager, string> = {
  npm: 'npx',
  pnpm: 'pnpm dlx',
  yarn: 'yarn dlx',
  bun: 'bunx',
}

export function packageSkillGuide(setup: PackageSkillSetup) {
  return {
    to: {
      path: '/learn/author-npm-package-skills',
      query: { manager: setup.manager, package: setup.package },
      hash: '#run-the-authoring-skill',
    },
    command: `${runners[setup.manager]} skilld@beta run skilld:skilld-dev/skilld/generate-package-skill`,
    prompt: `Draft a Skill for ${setup.package} in this repository. Follow the generate-package-skill instructions. Show the draft for review.`,
  }
}
