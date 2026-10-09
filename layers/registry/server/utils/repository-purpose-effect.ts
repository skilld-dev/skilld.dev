import type { GithubBindings } from './github-client'
import type { RepositoryPurposeEvidence, RepositoryPurposeFinding } from './repository-purpose'
import { isRegistrySkillPath } from '#shared/skill-path'
import { getRawFile, getRepoSummary, getTree } from './github-client'
import {
  classifyRepositoryPurpose,
  decideRepositoryPurposeAdmission,
  REPOSITORY_PURPOSE_MODEL,
  REPOSITORY_PURPOSE_PROMPT_VERSION,
  REPOSITORY_PURPOSE_REFRESH_SECONDS,
} from './repository-purpose'
import { markRepoMissing } from './sync-repo'

export type RepositoryPurposeJudge = (state: RepositoryPurposeEvidence) => Promise<unknown>
export interface RepositoryIdentity { owner: string, repo: string }
export interface RepositoryPurposeSourceMissing { _tag: 'source_missing', status: 404 | 410 }
export type RepositoryPurposeRefresh = RepositoryPurposeFinding | RepositoryPurposeSourceMissing

export async function listRepositoryPurposeCandidates(db: D1Database, now: number): Promise<RepositoryIdentity[]> {
  // Completed jobs are retained in `jobs` forever, so a correlated read over
  // that table walks every finished classification for every candidate. Active
  // jobs are bounded by in-flight work and reachable through the partial
  // idx_jobs_active index, and terminal failures are moved to `failed_jobs`,
  // where the one day retry wait is a failed_at index seek.
  const blocking = await db.prepare(`
    SELECT json_extract(payload,'$.owner') AS owner, json_extract(payload,'$.repo') AS repo
    FROM jobs INDEXED BY idx_jobs_active
    WHERE job_type='registry/repository-purpose' AND completed_at IS NULL AND failed_at IS NULL
    UNION ALL
    SELECT json_extract(payload,'$.owner') AS owner, json_extract(payload,'$.repo') AS repo
    FROM failed_jobs INDEXED BY idx_failed_jobs_failed_at
    WHERE job_type='registry/repository-purpose' AND failed_at>?1
  `).bind(now - 86400).all<RepositoryIdentity>()
  const blocked = JSON.stringify([...new Set(blocking.results.map(row => `${row.owner}/${row.repo}`))])
  const result = await db.prepare(`
    SELECT r.owner,r.repo FROM repos r
    LEFT JOIN repository_purpose p ON p.owner=r.owner AND p.repo=r.repo
    WHERE r.broken_since IS NULL AND r.repo_skill_count>0
      AND (p.owner IS NULL OR p.prompt_version!=?1 OR p.model_id!=?3 OR p.evaluated_at<?2 OR r.pushed_at>p.evaluated_at)
      AND NOT EXISTS (SELECT 1 FROM json_each(?4) AS b WHERE b.value=r.owner||'/'||r.repo)
    ORDER BY r.tree_truncated_at IS NOT NULL DESC, r.repo_skill_count>100 DESC,
      EXISTS(SELECT 1 FROM skills s WHERE s.owner=r.owner AND s.repo=r.repo) DESC,
      COALESCE(p.evaluated_at,0),r.owner,r.repo LIMIT 25
  `).bind(REPOSITORY_PURPOSE_PROMPT_VERSION, now - REPOSITORY_PURPOSE_REFRESH_SECONDS, REPOSITORY_PURPOSE_MODEL, blocked).all<RepositoryIdentity>()
  return result.results
}

export async function readRepositoryPurposeEvidence(
  input: RepositoryIdentity,
  bindings: GithubBindings,
): Promise<RepositoryPurposeEvidence | RepositoryPurposeSourceMissing> {
  const summary = await getRepoSummary(input.owner, input.repo, bindings)
  if (summary.status === 404 || summary.status === 410)
    return { _tag: 'source_missing', status: summary.status }
  if (!summary.data?.headCommitSha || !summary.data.headTreeSha || summary.data.meta.private)
    throw new Error(`Repository purpose source unavailable: ${summary.status}`)
  const { meta, headCommitSha, headTreeSha } = summary.data
  const tree = await getTree(meta.owner.login, meta.name, headTreeSha, bindings)
  if (!tree.data)
    throw new Error(`Repository purpose tree unavailable: ${tree.status}`)
  const blobs = tree.data.tree.filter(entry => entry.type === 'blob')
  const readme = blobs.find(entry => /^readme(?:\.md|\.markdown|\.rst|\.txt)?$/i.test(entry.path))
  const skillFiles = blobs.filter(entry => isRegistrySkillPath(entry.path))
    .sort((a, b) => a.path.localeCompare(b.path))
  const read = async (file: typeof readme, limit: number) => {
    if (!file)
      return null
    const content = await getRawFile(meta.owner.login, meta.name, headCommitSha, file.path, bindings, { maxBytes: limit * 4, timeoutMs: 10_000 })
    if (content === null)
      throw new Error(`Repository purpose file unavailable: ${file.path}`)
    return { path: file.path, content: content.slice(0, limit) }
  }
  const skills = await Promise.all(skillFiles.slice(0, 2).map(file => read(file, 2000)))
  return {
    ...input,
    sourceCommit: headCommitSha,
    description: meta.description?.slice(0, 1000) ?? null,
    readme: await read(readme, 6000),
    treeComplete: !tree.data.truncated,
    fileCount: tree.data.truncated ? null : blobs.length,
    skillCount: tree.data.truncated ? null : skillFiles.length,
    paths: [...blobs.slice(0, 40), ...skillFiles.slice(0, 40)].map(entry => entry.path.slice(0, 200)),
    skills: skills.filter((file): file is NonNullable<typeof file> => file !== null),
  }
}

export async function persistRepositoryPurpose(db: D1Database, finding: RepositoryPurposeFinding, now: number): Promise<void> {
  await db.prepare(`
    INSERT INTO repository_purpose (owner,repo,purpose,probability,reason,model,model_id,
      source_commit,prompt_version,evidence,answer,evaluated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(owner,repo) DO UPDATE SET
      purpose=excluded.purpose,probability=excluded.probability,reason=excluded.reason,
      model=excluded.model,model_id=excluded.model_id,source_commit=excluded.source_commit,
      prompt_version=excluded.prompt_version,evidence=excluded.evidence,answer=excluded.answer,
      evaluated_at=excluded.evaluated_at
    WHERE excluded.evaluated_at >= repository_purpose.evaluated_at
  `).bind(finding.evidence.owner, finding.evidence.repo, finding.purpose, finding.probability, finding.reason, finding.model, REPOSITORY_PURPOSE_MODEL, finding.sourceCommit, finding.promptVersion, JSON.stringify(finding.evidence), JSON.stringify(finding.answer), now).run()
}

export async function refreshRepositoryPurpose(deps: {
  db: D1Database
  readEvidence: (input: RepositoryIdentity) => Promise<RepositoryPurposeEvidence | RepositoryPurposeSourceMissing>
  judge: RepositoryPurposeJudge
}, input: RepositoryIdentity, now: number): Promise<RepositoryPurposeRefresh> {
  const evidence = await deps.readEvidence(input)
  if ('_tag' in evidence) {
    await markRepoMissing(deps.db, input.owner, input.repo, now)
    return evidence
  }
  const cached = await deps.db.prepare(`
    SELECT purpose,probability,reason,model,source_commit,prompt_version,evidence,answer
    FROM repository_purpose WHERE owner=? AND repo=? AND source_commit=?
      AND prompt_version=? AND model_id=? AND evaluated_at>?
  `).bind(input.owner, input.repo, evidence.sourceCommit, REPOSITORY_PURPOSE_PROMPT_VERSION, REPOSITORY_PURPOSE_MODEL, now - REPOSITORY_PURPOSE_REFRESH_SECONDS).first<{ purpose: RepositoryPurposeFinding['purpose'], probability: number, reason: string, model: string, source_commit: string, prompt_version: string, evidence: string, answer: string }>()
  if (cached) {
    return { _tag: 'classified', purpose: cached.purpose, probability: cached.probability, reason: cached.reason, model: cached.model, sourceCommit: cached.source_commit, promptVersion: cached.prompt_version, evidence: JSON.parse(cached.evidence), answer: JSON.parse(cached.answer) }
  }
  const result = await classifyRepositoryPurpose(evidence, deps.judge)
  if (result._tag === 'rejected')
    throw new Error(`Repository purpose classification failed: ${result.reason}`)
  await persistRepositoryPurpose(deps.db, result, now)
  return result
}

export async function checkRepositoryPurposeAdmission(
  db: D1Database,
  input: RepositoryIdentity & { ownerVerified: boolean },
  classify: () => Promise<RepositoryPurposeRefresh>,
) {
  const row = await db.prepare(`
    SELECT EXISTS(SELECT 1 FROM skills WHERE owner=?1 AND repo=?2) AS stored,
      EXISTS(SELECT 1 FROM skill_repo_eligibility WHERE owner=?1 AND repo=?2 AND status='eligible') AS eligible,
      EXISTS(SELECT 1 FROM repo_trust_overrides WHERE owner=?1 AND repo=?2
        AND tier IN ('official','trusted-author','trusted-curator')
        AND length(trim(reviewed_by))>0 AND length(trim(reason))>0) AS reviewed
  `).bind(input.owner, input.repo).first<{ stored: number, eligible: number, reviewed: number }>()
  if (row?.stored || row?.eligible || row?.reviewed || input.ownerVerified)
    return { _tag: 'continue' as const }
  const finding = await classify()
  if (finding._tag === 'source_missing')
    return { _tag: 'held' as const, reason: `repo fetch ${finding.status}` }
  return decideRepositoryPurposeAdmission({ purpose: finding.purpose, hasStoredSkills: false, humanEligible: false, ownerVerified: false })
}
