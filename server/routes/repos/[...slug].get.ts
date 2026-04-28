export default defineEventHandler((event) => {
  const slug = (getRouterParam(event, 'slug') ?? '').replace(/^\/+/, '')
  const owner = slug.split('/')[0] ?? ''
  const target = owner ? `/orgs/${owner}` : '/skills'
  return sendRedirect(event, target, 308)
})
