import { z } from 'zod'

export const packageEcosystemSchema = z.enum(['npm', 'pypi', 'crates', 'go', 'rubygems'])
export type PackageEcosystem = z.infer<typeof packageEcosystemSchema>

export const packageEcosystems = {
  npm: {
    label: 'npm',
    language: 'JavaScript / TypeScript',
    icon: 'i-simple-icons-npm',
    manifest: 'package.json',
    example: '@your-org/your-package',
    inputLabel: 'Package name or npm link',
    help: 'Use the package name, including its scope.',
    guide: '/learn/author-npm-package-skills',
    topics: ['Write a Skill from your public API', 'Include Skill files in your npm package', 'Check the tarball before publishing'],
    host: 'npmjs.com',
    prefix: '/package/',
  },
  pypi: {
    label: 'PyPI',
    language: 'Python',
    icon: 'i-simple-icons-pypi',
    manifest: 'pyproject.toml',
    example: 'your-package',
    inputLabel: 'Package name or PyPI link',
    help: 'Use the distribution name from pyproject.toml.',
    guide: '/learn/author-pypi-package-skills',
    topics: ['Write a Skill from your Python API', 'Include Skill files with your build backend', 'Check the wheel and source distribution'],
    host: 'pypi.org',
    prefix: '/project/',
  },
  crates: {
    label: 'crates.io',
    language: 'Rust',
    icon: 'i-simple-icons-rust',
    manifest: 'Cargo.toml',
    example: 'your_crate',
    inputLabel: 'Crate name or crates.io link',
    help: 'Use the package name from Cargo.toml.',
    guide: '/learn/author-rust-package-skills',
    topics: ['Write a Skill for your crate and feature flags', 'Include Skill files in the crate', 'Check the package with Cargo'],
    host: 'crates.io',
    prefix: '/crates/',
  },
  go: {
    label: 'Go modules',
    language: 'Go',
    icon: 'i-simple-icons-go',
    manifest: 'go.mod',
    example: 'github.com/your-org/your-module',
    inputLabel: 'Module path or pkg.go.dev link',
    help: 'Use the full module path from go.mod.',
    guide: '/learn/author-go-package-skills',
    topics: ['Write a Skill for your Go module', 'Keep Skill files inside the module', 'Publish with the correct version tag'],
    host: 'pkg.go.dev',
    prefix: '/',
  },
  rubygems: {
    label: 'RubyGems',
    language: 'Ruby',
    icon: 'i-simple-icons-rubygems',
    manifest: '.gemspec',
    example: 'your_gem',
    inputLabel: 'Gem name or RubyGems link',
    help: 'Use the gem name from your .gemspec file.',
    guide: '/learn/author-ruby-package-skills',
    topics: ['Write a Skill from your Ruby API', 'Include Skill files in the gemspec', 'Inspect the built gem before publishing'],
    host: 'rubygems.org',
    prefix: '/gems/',
  },
} as const

export interface PackageSkillSetup {
  ecosystem: PackageEcosystem
  package: string
}

type SetupResult
  = | { _tag: 'Ok', value: PackageSkillSetup }
    | { _tag: 'Err', field: 'ecosystem' | 'package', message: string }

const packageNames = {
  npm: z.string().max(214).regex(/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/),
  pypi: z.string().regex(/^[a-z0-9](?:[\w.-]*[a-z0-9])?$/i).transform(name => name.toLowerCase().replace(/[-_.]+/g, '-')),
  crates: z.string().regex(/^[a-z_][\w-]*$/i),
  go: z.string().regex(/^[a-z0-9.-]+\.[a-z0-9-]+(?:\/[\w.~/-]+)?$/i).refine(name => name.split('/').every(segment => segment && segment !== '.' && segment !== '..')),
  rubygems: z.string().regex(/^[a-z0-9][\w.-]*$/i),
} satisfies Record<PackageEcosystem, z.ZodType<string>>

export function parsePackageSkillSetup(input: { ecosystem?: unknown, package?: unknown }): SetupResult {
  const ecosystem = packageEcosystemSchema.safeParse(input.ecosystem)
  if (!ecosystem.success)
    return { _tag: 'Err', field: 'ecosystem', message: 'Choose where you publish your package.' }

  const config = packageEcosystems[ecosystem.data]
  const invalid: SetupResult = {
    _tag: 'Err',
    field: 'package',
    message: `Enter ${ecosystem.data === 'go' ? 'a module path' : 'a package name'}, such as ${config.example}. You can also paste its ${config.host} link.`,
  }
  if (typeof input.package !== 'string')
    return invalid

  let name = input.package.trim()
  if (/^https?:\/\//i.test(name)) {
    // URL syntax and percent encoding can both fail for pasted input.
    try {
      const url = new URL(name)
      if (url.hostname.replace(/^www\./, '') !== config.host || !url.pathname.startsWith(config.prefix) || url.username || url.password || url.port)
        return invalid
      name = decodeURIComponent(url.pathname.slice(config.prefix.length)).replace(/\/$/, '')
    }
    catch {
      return invalid
    }
  }

  const parsed = packageNames[ecosystem.data].safeParse(name)
  if (!parsed.success)
    return invalid

  return { _tag: 'Ok', value: { ecosystem: ecosystem.data, package: parsed.data } }
}

export const packageSkillSource = 'https://raw.githubusercontent.com/skilld-dev/skilld/main/skills/generate-package-skill/SKILL.md'

export function packageSkillGuide(setup: PackageSkillSetup) {
  const config = packageEcosystems[setup.ecosystem]
  return {
    to: { path: config.guide, query: { package: setup.package } },
    prompt: [
      `Read ${packageSkillSource}.`,
      `Draft a Skill for ${setup.package}, published through ${config.label}, using this repository.`,
      `Read ${config.manifest}, the public API, and the current official documentation.`,
      ...(setup.ecosystem === 'npm' ? ['Save each Skill in skills/<name>/SKILL.md beside package.json, so pnpm can discover it.', 'Include the Skill and its linked files in the published tarball. Read https://pnpm.io/agent-skills for pnpm approval and linking.'] : []),
      'Show the draft for review before replacing existing Skills.',
    ].join('\n\n'),
  }
}
