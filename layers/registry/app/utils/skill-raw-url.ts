interface SkillRawUrlInput {
  rootUrl: string
  skillFileUrl: string | null
  activeDocPath: string
}

export function resolveSkillRawUrl(input: SkillRawUrlInput): string {
  if (!input.activeDocPath || !input.skillFileUrl)
    return input.rootUrl

  const lastSlash = input.skillFileUrl.lastIndexOf('/')
  if (lastSlash === -1 || !input.skillFileUrl.includes('/blob/'))
    return input.rootUrl

  const encodedPath = input.activeDocPath
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/')
  if (!encodedPath)
    return input.rootUrl

  const sourceDir = input.skillFileUrl.slice(0, lastSlash + 1).replace('/blob/', '/raw/')
  return `${sourceDir}${encodedPath}`
}
