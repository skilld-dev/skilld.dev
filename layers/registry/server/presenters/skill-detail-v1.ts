import type { OperationResult, skillsV1 } from 'skilld-sdk/contract'
import { epochSecondsToIso, presentCount } from '#shared/server/skill-cards'
import { skillInstallCmd, skillRunCmd } from '#shared/skill-commands'

/** The fields of the `/api/skills/<owner>/<repo>/<name>` answer that the v1 detail reads. */
export interface LegacySkillDetail {
  owner: string
  repo: string
  name: string
  registryPath: string
  displayName: string
  description: string | null
  authorName: string | null
  license: string | null
  githubUrl: string
  skillPath: string | null
  sourceGone: boolean
  raw: string | null
  stars: number
  likeCount: number
  pushedAt: string | null
  assets: { path: string, size: number }[]
  tags: { slug: string }[]
  summary: { text: string } | null
  sourceFacts: {
    frontmatter: { allowedTools: string[] }
    /** Matched on the SKILL.md text and the file names. Each location also carries a GitHub URL. */
    behaviors: {
      id: string
      tier: 'ask' | 'show'
      label: string
      locations: { path: string, line: number | null }[]
      total: number
    }[]
  }
  provenance: {
    sourceCommitSha: string | null
    skillFileUrl: string | null
    /** Epoch seconds. */
    modifiedAt: number | null
  }
}

const SITE_ORIGIN = 'https://skilld.dev'

export function presentSkillDetail(detail: LegacySkillDetail): OperationResult<typeof skillsV1.operations.get> {
  return {
    owner: detail.owner,
    repository: detail.repo,
    name: detail.name,
    displayName: detail.displayName,
    description: detail.description,
    stars: presentCount(detail.stars),
    likes: presentCount(detail.likeCount),
    updatedAt: epochSecondsToIso(detail.provenance.modifiedAt),
    pageUrl: `${SITE_ORIGIN}${detail.registryPath}`,
    sourceUrl: detail.provenance.skillFileUrl,
    runCommand: skillRunCmd(detail.owner, detail.repo, detail.name),
    installCommand: skillInstallCmd(detail.owner, detail.repo, detail.name),
    authorName: detail.authorName,
    license: detail.license,
    repositoryUrl: detail.githubUrl,
    skillPath: detail.skillPath,
    sourceCommit: detail.provenance.sourceCommitSha,
    sourceGone: detail.sourceGone,
    pushedAt: detail.pushedAt,
    tags: detail.tags.map(tag => tag.slug),
    allowedTools: detail.sourceFacts.frontmatter.allowedTools,
    files: detail.assets.map(file => ({ path: file.path, size: Math.max(0, Math.trunc(file.size)) })),
    generatedSummary: detail.summary?.text ?? null,
    markdown: detail.raw,
    // The page's locations also link GitHub. The contract keeps the path and line.
    behaviors: detail.sourceFacts.behaviors.map(behavior => ({
      id: behavior.id,
      tier: behavior.tier,
      label: behavior.label,
      locations: behavior.locations.map(location => ({ path: location.path, line: location.line })),
      total: behavior.total,
    })),
  }
}
