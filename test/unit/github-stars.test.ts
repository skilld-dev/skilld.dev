import { formatGithubStars } from '../../app/utils/github-stars'

describe('formatGithubStars', () => {
  it.each([
    [999, '999'],
    [1_200, '1.2k'],
    [10_400, '10k'],
    [201_114, '201k'],
    [1_250_000, '1.3m'],
  ])('formats %i as %s', (stars, expected) => {
    expect(formatGithubStars(stars)).toBe(expected)
  })
})
