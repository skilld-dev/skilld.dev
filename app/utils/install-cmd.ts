const PREFIX = 'npx skilld add'

export function gitInstallCmd(owner: string, repo: string, skill?: string): string {
  const base = `${PREFIX} gh:${owner}/${repo}`
  return skill ? `${base} -s ${skill}` : base
}

export function curatorInstallCmd(handle: string): string {
  return `${PREFIX} @${handle}`
}

export function collectionInstallCmd(handle: string, slug: string): string {
  return `${PREFIX} @${handle}/${slug}`
}
