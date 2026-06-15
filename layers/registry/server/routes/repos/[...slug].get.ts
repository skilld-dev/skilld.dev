import { ownerHubPath, repoHubPath } from '../../utils/skill-routes'

export default defineEventHandler((event) => {
  const slug = (getRouterParam(event, 'slug') ?? '').replace(/^\/+/, '')
  const [owner, repo] = slug.split('/')
  const target = owner && repo ? repoHubPath(owner, repo) : owner ? ownerHubPath(owner) : '/skills'
  return sendRedirect(event, target, 308)
})
