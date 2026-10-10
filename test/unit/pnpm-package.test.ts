import { detectPnpmPackage } from '../../layers/registry/server/utils/pnpm-package'
import { tarGzFixture } from '../fixtures/tar-archive'

const source = { owner: 'acme', repo: 'kit', ref: 'abc123', skillPath: 'packages/ui/skills/auth/SKILL.md' }
const manifest = { name: '@acme/ui', version: '1.0.0' }
const published = {
  name: '@acme/ui',
  version: '1.0.0',
  repository: { url: 'git+https://github.com/acme/kit.git', directory: 'packages/ui' },
  dist: { tarball: 'https://registry.npmjs.org/@acme/ui/-/ui-1.0.0.tgz' },
}

function reads(options: { manifest?: unknown, published?: unknown, path?: string, typeflag?: string, status?: number } = {}) {
  const urls: string[] = []
  const fetcher: typeof fetch = async (input) => {
    const url = String(input)
    urls.push(url)
    if (url.includes('raw.githubusercontent.com'))
      return Response.json(options.manifest ?? manifest)
    if (url.endsWith('/latest'))
      return Response.json(options.published ?? published, { status: options.status ?? 200 })
    return new Response(tarGzFixture('package', [{ path: options.path ?? 'skills/auth/SKILL.md', typeflag: options.typeflag, bytes: new TextEncoder().encode('---\nname: auth\n---\nUse auth.') }]))
  }
  return { fetcher, urls }
}

describe('published pnpm Skills', () => {
  it('detects a scoped monorepo package from its published archive', async () => {
    const { fetcher } = reads()
    expect(await detectPnpmPackage(source, fetcher)).toEqual({
      _tag: 'Found',
      package: '@acme/ui',
      version: '1.0.0',
      skill: 'auth',
    })
  })

  it.each([
    { manifest: { ...manifest, private: true } },
    { manifest: { name: 'bad;echo secret' } },
    { published: { ...published, repository: { url: 'https://github.com/other/kit' } } },
    { published: { ...published, name: '@other/ui' } },
    { published: { ...published, dist: { tarball: 'https://evil.test/archive.tgz' } } },
    { path: 'SKILL.md' },
    { path: 'skills/auth/nested/SKILL.md' },
    { typeflag: '2' },
    { status: 404 },
  ])('does not offer pnpm for unsupported publication %j', async (options) => {
    expect(await detectPnpmPackage(source, reads(options).fetcher)).toEqual({ _tag: 'Absent' })
  })

  it('does not read manifests for a root or nested Skill outside pnpm layout', async () => {
    const { fetcher, urls } = reads()
    expect(await detectPnpmPackage({ ...source, skillPath: 'SKILL.md' }, fetcher)).toEqual({ _tag: 'Absent' })
    expect(await detectPnpmPackage({ ...source, skillPath: 'skills/group/auth/SKILL.md' }, fetcher)).toEqual({ _tag: 'Absent' })
    expect(urls).toEqual([])
  })

  it('keeps upstream outages distinct from a package without Skills', async () => {
    expect(await detectPnpmPackage(source, reads({ status: 503 }).fetcher)).toEqual({ _tag: 'Unavailable' })
  })
})
