// @vitest-environment node

import contentConfig from '../../layers/marketing/content.config'

vi.mock('@harlan-zw/comark-content', () => ({
  defineCollection: <T>(collection: T) => collection,
  defineContentConfig: <T>(config: T) => config,
}))

describe('marketing content collections', () => {
  it('resolves learn content from the marketing layer', () => {
    const source = contentConfig.collections.learn.source

    expect(source).toMatchObject({
      include: 'learn/*.md',
      prefix: '/learn',
    })
    expect(typeof source === 'string' ? '' : source.cwd)
      .toMatch(/layers\/marketing\/content$/)
  })
})
