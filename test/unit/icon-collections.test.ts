import { describe, expect, it } from 'vitest'
import { iconifyCollections } from '#shared/icon-collections'

describe('iconifyCollections', () => {
  it('names every installed collection in dependency order', () => {
    expect(iconifyCollections({
      dependencies: {
        '@iconify-json/vscode-icons': 'catalog:',
        '@iconify-json/simple-icons': 'catalog:',
      },
    })).toEqual(['vscode-icons', 'simple-icons'])
  })

  it('ignores dependencies that are not icon collections', () => {
    expect(iconifyCollections({
      dependencies: {
        'nuxt': 'catalog:',
        '@iconify-json/lucide': 'catalog:',
      },
    })).toEqual(['lucide'])
  })

  it('excludes an icon package that only sits in devDependencies', () => {
    expect(iconifyCollections({
      dependencies: { '@iconify-json/lucide': 'catalog:' },
      devDependencies: { '@iconify-json/vscode-icons': 'catalog:' },
    })).toEqual(['lucide'])
  })

  it('names nothing when no icon packages are installed', () => {
    expect(iconifyCollections({ dependencies: { nuxt: 'catalog:' } })).toEqual([])
  })
})
