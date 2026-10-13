import { describe, expect, it } from 'vitest'
import {
  LLMS_SECTIONS,
  parseSitemapLocs,
  readableSitemap,
  renderLlmsIndex,
  renderLlmsSection,
  sitemapName,
  sitemapPages,
} from '../../shared/llms-txt'

const site = { name: 'skilld', description: 'Curated agent skills by humans' }

describe('llms.txt sitemap reading', () => {
  it('names each child sitemap, chunked or not, and never reads the retired one', () => {
    const index = `<sitemapindex>
      <sitemap><loc>https://skilld.dev/__sitemap__/pages.xml</loc></sitemap>
      <sitemap><loc>https://skilld.dev/__sitemap__/skills-0.xml</loc></sitemap>
      <sitemap><loc>https://skilld.dev/__sitemap__/retired-0.xml</loc></sitemap>
    </sitemapindex>`
    const names = parseSitemapLocs(index).map(sitemapName)
    expect(names).toEqual(['pages', 'skills', 'retired'])
    expect(names.filter(name => name && readableSitemap(name))).toEqual(['pages', 'skills'])
    expect(sitemapName('https://skilld.dev/gh/antfu/skills/antfu')).toBeNull()
  })

  it('keeps one path per page, without query views or other origins', () => {
    const locs = parseSitemapLocs(`<urlset>
      <url><loc>https://skilld.dev/skills/trending</loc></url>
      <url><loc>https://skilld.dev/skills/trending?range=all&amp;page=2</loc></url>
      <url><loc>https://skilld.dev/learn/create-agent-skills/</loc></url>
      <url><loc>https://example.com/elsewhere</loc></url>
      <url><loc>https://skilld.dev/</loc></url>
    </urlset>`)
    expect(sitemapPages(locs)).toEqual([
      { path: '/skills/trending' },
      { path: '/learn/create-agent-skills' },
      { path: '/' },
    ])
  })
})

describe('llms.txt rendering', () => {
  const meta = new Map([
    ['/', { title: 'Curated agent skills by humans · skilld', description: 'Agent skills written by real maintainers.' }],
    ['/gh/antfu/skills/antfu', { title: 'antfu [skill] · skilld', description: 'Anthony Fu\'s\nconventions.' }],
  ])

  it('links every nested file and each page\'s Markdown, and never llms-full.txt', () => {
    const text = renderLlmsIndex({ site, pages: [{ path: '/' }, { path: '/verify' }], sections: LLMS_SECTIONS, meta })
    expect(text.startsWith('# skilld\n\n> Curated agent skills by humans\n')).toBe(true)
    for (const section of LLMS_SECTIONS)
      expect(text).toContain(`](https://skilld.dev${section.path})`)
    expect(text).toContain('- [Curated agent skills by humans](https://skilld.dev/index.md): Agent skills written by real maintainers.')
    // No stored title yet: the path stands in.
    expect(text).toContain('- [/verify](https://skilld.dev/verify.md)')
    expect(text).not.toContain('llms-full.txt')
    expect(text).not.toContain('](https://skilld.dev/api/mcp)')
  })

  it('renders a nested file that points back to the index and keeps links parseable', () => {
    const [skills] = LLMS_SECTIONS
    const text = renderLlmsSection({ site, section: skills!, pages: [{ path: '/gh/antfu/skills/antfu' }], meta })
    expect(text).toContain('https://skilld.dev/llms.txt')
    expect(text).toContain('- [antfu \\[skill\\]](https://skilld.dev/gh/antfu/skills/antfu.md): Anthony Fu\'s conventions.')
  })
})
