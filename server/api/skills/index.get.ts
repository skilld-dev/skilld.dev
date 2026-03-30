export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const search = (query.q as string || '').toLowerCase().trim()
  const page = Number(query.page) || 1
  const limit = Math.min(Number(query.limit) || 60, 200)

  const skills = await getSkillsFromSitemap()

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
