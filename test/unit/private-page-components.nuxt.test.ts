import { useRouter } from '#app'

describe('private page components', () => {
  it.each(['/_HomeDemoCarousel', '/brand-kit/_GithubBadgePreview'])(
    'does not resolve %s as a page',
    (path) => {
      expect(useRouter().resolve(path).name).toBeUndefined()
    },
  )
})
