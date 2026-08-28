import { repoHubPath } from './skill-routes'

export interface SkillBadgeEmbedInput {
  owner: string
  repo: string
  name: string
  registryPath: string
  siteUrl?: string
  showLikes?: boolean
  showLabel?: boolean
}

export type SkillBadgeTheme = 'light' | 'dark'

const DEFAULT_SITE_URL = 'https://skilld.dev'

export function skillBadgeImagePath(input: SkillBadgeEmbedInput, theme?: SkillBadgeTheme): string {
  const repoPath = repoHubPath(input.owner, input.repo)
  const badgeSegments = input.registryPath === repoPath
    ? [input.owner, input.repo]
    : [input.owner, input.repo, input.name]
  const badgePath = badgeSegments.map(encodeURIComponent).join('/')
  const query = new URLSearchParams()
  if (input.showLikes)
    query.set('likes', '1')
  if (theme)
    query.set('theme', theme)
  if (input.showLabel === false)
    query.set('label', '0')

  const queryString = query.toString()
  return `/b/${badgePath}${queryString ? `?${queryString}` : ''}`
}

export function skillBadgeImageUrl(input: SkillBadgeEmbedInput, theme?: SkillBadgeTheme): string {
  const siteUrl = (input.siteUrl ?? DEFAULT_SITE_URL).replace(/\/+$/, '')
  return `${siteUrl}${skillBadgeImagePath(input, theme)}`
}

export function skillBadgeEmbed(input: SkillBadgeEmbedInput): string {
  const siteUrl = (input.siteUrl ?? DEFAULT_SITE_URL).replace(/\/+$/, '')
  const repositoryPath = repoHubPath(input.owner, input.repo)
  const registryPath = (input.registryPath.startsWith('/')
    ? input.registryPath
    : `/${input.registryPath}`)
    .split('/')
    .map(encodeURIComponent)
    .join('/')
  const alt = input.registryPath === repositoryPath
    ? 'Skill repository on skilld.dev'
    : 'Agent skill on skilld.dev'
  const darkImageUrl = skillBadgeImageUrl(input, 'dark')
  const lightImageUrl = skillBadgeImageUrl(input, 'light')

  return `<a href="${siteUrl}${registryPath}">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="${darkImageUrl}">
    <source media="(prefers-color-scheme: light)" srcset="${lightImageUrl}">
    <img alt="${alt}" src="${lightImageUrl}">
  </picture>
</a>`
}
