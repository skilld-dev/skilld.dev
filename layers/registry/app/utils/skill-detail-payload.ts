import { resolveSkillContextChecks } from './skill-context-checks'
import { resolveSkillContextCost } from './skill-context-cost'

interface SourceDetail {
  raw: string | null
  frontmatter: Record<string, unknown> | null
  name: string
  description: string | null
  sourceGone: boolean
  assets: { path: string, size: number, type: 'markdown' | 'code' | 'image' | 'data' | 'other' }[]
}

/** Preserve source summaries in SSR. Fetch live source only when a control needs it. */
export function skillDetailPayload<T extends SourceDetail>(detail: T) {
  return {
    ...detail,
    raw: detail.sourceGone ? detail.raw : null,
    sourceView: {
      hasRaw: !!detail.raw,
      bytes: new TextEncoder().encode(detail.raw ?? '').byteLength,
      cost: resolveSkillContextCost({ ...detail, files: detail.assets }),
      checks: resolveSkillContextChecks(detail),
    },
  }
}
