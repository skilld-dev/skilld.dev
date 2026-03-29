interface Skill {
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

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const search = (query.q as string || '').toLowerCase().trim()
  const page = Number(query.page) || 1
  const limit = Math.min(Number(query.limit) || 60, 200)

  let skills = await useStorage('data').getItem<Skill[]>(CACHE_KEY)

  if (!skills) {
    skills = await fetchAndParseSitemap()
    await useStorage('data').setItem(CACHE_KEY, skills, { ttl: CACHE_TTL })
  }

  let filtered = skills
  if (search) {
    filtered = skills.filter(s =>
      s.name.includes(search)
      || s.owner.includes(search)
      || s.slug.includes(search),
    )
  }

  const total = filtered.length
  const offset = (page - 1) * limit
  const items = filtered.slice(offset, offset + limit)

  return {
    items,
    total,
    page,
    pages: Math.ceil(total / limit),
  }
})

async function fetchAndParseSitemap(): Promise<Skill[]> {
  const xml = await $fetch<string>(SITEMAP_URL, { responseType: 'text' })

  // Parse <loc> tags from sitemap XML
  LOC_RE.lastIndex = 0
  const skills: Skill[] = []
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

function parseSkillUrl(url: string): Skill | null {
  const path = new URL(url).pathname.replace(SLASH_TRIM_RE, '')
  const parts = path.split('/')

  // Pattern: /{owner}/{skills|repo}/{name} or /{owner}/{name}
  if (parts.length < 2)
    return null

  const owner = parts[0]!
  // Skip top-level pages like /official, /audits, /docs
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
