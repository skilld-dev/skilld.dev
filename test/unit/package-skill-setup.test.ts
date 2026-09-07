// @vitest-environment node
import { packageSkillGuide, parsePackageSkillSetup } from '../../layers/marketing/app/utils/package-skill-setup'

describe('package ecosystem setup', () => {
  it.each([
    ['npm', ' @nuxt/ui ', '@nuxt/ui'],
    ['npm', 'https://www.npmjs.com/package/@nuxt/ui?activeTab=readme', '@nuxt/ui'],
    ['pypi', 'My_Package.Name', 'my-package-name'],
    ['pypi', 'https://pypi.org/project/requests/', 'requests'],
    ['crates', 'serde_json', 'serde_json'],
    ['crates', 'https://crates.io/crates/serde', 'serde'],
    ['go', 'github.com/acme/my-module/v2', 'github.com/acme/my-module/v2'],
    ['go', 'go4.org', 'go4.org'],
    ['go', 'https://pkg.go.dev/github.com/acme/my-module/v2', 'github.com/acme/my-module/v2'],
    ['rubygems', 'my_gem', 'my_gem'],
    ['rubygems', 'https://rubygems.org/gems/rails', 'rails'],
  ])('reads %s package input %s', (ecosystem, input, name) => {
    expect(parsePackageSkillSetup({ ecosystem, package: input })).toEqual({
      _tag: 'Ok',
      value: { ecosystem, package: name },
    })
  })

  it.each([
    ['npm', ''],
    ['npm', '@scope'],
    ['npm', 'vue@3'],
    ['npm', 'Vue'],
    ['npm', 'a'.repeat(215)],
    ['npm', 'https://pypi.org/project/vue'],
    ['npm', 'https://npmjs.com.evil.test/package/vue'],
    ['npm', 'https://npmjs.com/package/%ZZ'],
    ['pypi', '_requests'],
    ['pypi', 'requests/extra'],
    ['crates', '@scope/serde'],
    ['crates', 'serde.json'],
    ['go', 'my-module'],
    ['go', 'github.com/acme/../module'],
    ['rubygems', 'rails;echo hello'],
    ['pypi', ['requests']],
  ])('rejects invalid %s input %j', (ecosystem, name) => {
    expect(parsePackageSkillSetup({ ecosystem, package: name })).toMatchObject({ _tag: 'Err', field: 'package' })
  })

  it.each(['pnpm', 'yarn', 'bun', undefined, ['npm', 'pypi']])('requires a publishing ecosystem, received %j', (ecosystem) => {
    expect(parsePackageSkillSetup({ ecosystem, package: 'vue' })).toMatchObject({ _tag: 'Err', field: 'ecosystem' })
  })

  it.each([
    ['npm', '@nuxt/ui', 'author-npm-package-skills', 'package.json'],
    ['pypi', 'requests', 'author-pypi-package-skills', 'pyproject.toml'],
    ['crates', 'serde', 'author-rust-package-skills', 'Cargo.toml'],
    ['go', 'github.com/acme/module', 'author-go-package-skills', 'go.mod'],
    ['rubygems', 'rails', 'author-ruby-package-skills', '.gemspec'],
  ])('opens the %s guide with package context', (ecosystem, name, slug, manifest) => {
    const parsed = parsePackageSkillSetup({ ecosystem, package: name })
    if (parsed._tag === 'Err')
      throw new Error(parsed.message)

    const guide = packageSkillGuide(parsed.value)
    expect(guide.to).toEqual({ path: `/learn/${slug}`, query: { package: name } })
    expect(guide.prompt).toContain(name)
    expect(guide.prompt).toContain(manifest)
    expect(guide.prompt).toContain('https://raw.githubusercontent.com/skilld-dev/skilld/main/skills/generate-package-skill/SKILL.md')
  })
})
