// @vitest-environment node
import { packageSkillGuide, parsePackageSkillSetup } from '../../layers/marketing/app/utils/package-skill-setup'

describe('package skill setup', () => {
  it.each(['vue', '@nuxt/ui', 'my.package', 'my_package'])('accepts package %s', (name) => {
    expect(parsePackageSkillSetup({ manager: 'pnpm', package: ` ${name} ` })).toEqual({
      _tag: 'Ok',
      value: { manager: 'pnpm', package: name },
    })
  })

  it.each(['', '  ', '@scope', 'owner/repo', 'vue@3', 'Vue', '--help', 'vue;echo hi', '$(whoami)', 'a'.repeat(215)])('rejects invalid package %j', (name) => {
    expect(parsePackageSkillSetup({ manager: 'npm', package: name })).toMatchObject({
      _tag: 'Err',
      field: 'package',
    })
  })

  it.each([undefined, null, ['vue'], { name: 'vue' }])('rejects non-string package %j', (value) => {
    expect(parsePackageSkillSetup({ manager: 'npm', package: value })).toMatchObject({ _tag: 'Err', field: 'package' })
  })

  it.each(['pip', '', undefined, ['npm', 'bun']])('rejects unsupported manager %j', (manager) => {
    expect(parsePackageSkillSetup({ manager, package: 'vue' })).toMatchObject({ _tag: 'Err', field: 'manager' })
  })

  it.each([
    ['npm', 'npx'],
    ['pnpm', 'pnpm dlx'],
    ['yarn', 'yarn dlx'],
    ['bun', 'bunx'],
  ] as const)('builds the %s guide with the selected package', (manager, runner) => {
    const parsed = parsePackageSkillSetup({ manager, package: '@nuxt/ui' })
    if (parsed._tag === 'Err')
      throw new Error(parsed.message)

    const guide = packageSkillGuide(parsed.value)
    expect(guide.to).toEqual({
      path: '/learn/author-npm-package-skills',
      query: { manager, package: '@nuxt/ui' },
      hash: '#run-the-authoring-skill',
    })
    expect(guide.command).toBe(`${runner} skilld@beta run skilld:skilld-dev/skilld/generate-package-skill`)
    expect(guide.prompt).toBe('Draft a Skill for @nuxt/ui in this repository. Follow the generate-package-skill instructions. Show the draft for review.')
  })
})
