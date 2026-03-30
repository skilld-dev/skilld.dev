export interface SitemapSkill {
  owner: string
  repo: string
  name: string
  slug: string
  url: string
}

const SITEMAP_URL = 'https://skills.sh/sitemap.xml'
const CACHE_KEY = 'skills:sitemap:parsed'
const CACHE_TTL = 60 * 60 // 1 hour
const LOC_RE = /<loc>(.*?)<\/loc>/g
const SLASH_TRIM_RE = /^\/|\/$/g

export async function getSkillsFromSitemap(): Promise<SitemapSkill[]> {
  let skills = await useStorage('data').getItem<SitemapSkill[]>(CACHE_KEY)
  if (!skills) {
    skills = await fetchAndParseSitemap()
    await useStorage('data').setItem(CACHE_KEY, skills, { ttl: CACHE_TTL })
  }
  return skills
}

async function fetchAndParseSitemap(): Promise<SitemapSkill[]> {
  const xml = await $fetch<string>(SITEMAP_URL, { responseType: 'text' })

  LOC_RE.lastIndex = 0
  const skills: SitemapSkill[] = []
  const seen = new Set<string>()

  let match = LOC_RE.exec(xml)
  while (match) {
    const url = match[1]!
    const parsed = parseSkillUrl(url)
    if (parsed && !seen.has(parsed.slug)) {
      seen.add(parsed.slug)
      skills.push(parsed)
    }
    match = LOC_RE.exec(xml)
  }

  return skills
}

function parseSkillUrl(url: string): SitemapSkill | null {
  const path = new URL(url).pathname.replace(SLASH_TRIM_RE, '')
  const parts = path.split('/')

  if (parts.length < 2)
    return null

  const owner = parts[0]!
  if (['official', 'audits', 'docs'].includes(owner))
    return null

  let name: string
  let repo: string

  if (parts.length >= 3) {
    repo = parts[1]!
    name = parts.slice(2).join('/')
  }
  else {
    repo = 'skills'
    name = parts[1]!
  }

  return {
    owner,
    repo,
    name,
    slug: `${owner}/${name}`,
    url,
  }
}
