export const SKILL_REPO_APPROVAL_STUCK_SECONDS = 15 * 60

export type SkillRepoReviewStatus = 'eligible' | 'rejected'

export interface SkillRepoReviewCandidate {
  owner: string
  repo: string
  stars: number
  skillCount: number
  pushedAt: number | null
}

export interface SkillRepoReviewDecision {
  owner: string
  repo: string
  status: SkillRepoReviewStatus
  reason: string
  reviewedBy: string
  reviewedAt: number
  visibility: 'visible' | 'pending'
}

export interface StuckSkillRepoApproval {
  owner: string
  repo: string
  reason: string
  reviewedAt: number
}

export interface SkillRepoReviewQueue {
  candidates: SkillRepoReviewCandidate[]
  decisions: SkillRepoReviewDecision[]
  stuckApprovals: StuckSkillRepoApproval[]
}

interface CandidateRow {
  owner: string
  repo: string
  stars: number
  skill_count: number
  pushed_at: number | null
}

interface DecisionRow {
  owner: string
  repo: string
  status: SkillRepoReviewStatus
  reason: string
  reviewed_by: string
  reviewed_at: number
  visible: number
}

interface StuckApprovalRow {
  owner: string
  repo: string
  reason: string
  reviewed_at: number
}

interface VisibilityRow {
  visible: number
}

interface OwnerKindRow {
  kind: string | null
}

export async function listSkillRepoReviewQueue(
  db: D1Database,
  input: {
    now: number
    candidateLimit: number
    decisionLimit: number
  },
): Promise<SkillRepoReviewQueue> {
  const [candidateResult, decisionResult, stuckResult] = await Promise.all([
    db.prepare(`
      WITH repository_inventory AS (
        SELECT
          r.owner,
          r.repo,
          r.stars,
          r.pushed_at,
          COUNT(s.name) AS skill_count
        FROM repos AS r
        JOIN owners AS owner
          ON owner.owner = r.owner
         AND owner.kind = 'user'
        JOIN skills AS s
          ON s.owner = r.owner
         AND s.repo = r.repo
        WHERE r.broken_since IS NULL
        GROUP BY r.owner, r.repo, r.stars, r.pushed_at
        HAVING COUNT(s.name) >= 2
      )
      SELECT
        inventory.owner,
        inventory.repo,
        inventory.stars,
        inventory.skill_count,
        inventory.pushed_at
      FROM repository_inventory AS inventory
      LEFT JOIN skill_repo_eligibility AS review
        ON review.owner = inventory.owner
       AND review.repo = inventory.repo
      WHERE review.owner IS NULL
      ORDER BY
        inventory.stars DESC,
        inventory.owner COLLATE NOCASE,
        inventory.repo COLLATE NOCASE
      LIMIT ?
    `).bind(input.candidateLimit).all<CandidateRow>(),
    db.prepare(`
      SELECT
        review.owner,
        review.repo,
        review.status,
        review.reason,
        review.reviewed_by,
        review.reviewed_at,
        CASE WHEN EXISTS (
          SELECT 1
          FROM repos AS r
          JOIN owners AS owner
            ON owner.owner = r.owner
           AND owner.kind = 'user'
          JOIN skills AS s
            ON s.owner = r.owner
           AND s.repo = r.repo
          WHERE r.owner = review.owner
            AND r.repo = review.repo
            AND r.broken_since IS NULL
        ) THEN 1 ELSE 0 END AS visible
      FROM skill_repo_eligibility AS review
      ORDER BY
        visible DESC,
        review.reviewed_at DESC,
        review.owner COLLATE NOCASE,
        review.repo COLLATE NOCASE
      LIMIT ?
    `).bind(input.decisionLimit).all<DecisionRow>(),
    db.prepare(`
      SELECT
        review.owner,
        review.repo,
        review.reason,
        review.reviewed_at
      FROM skill_repo_eligibility AS review
      WHERE review.status = 'eligible'
        AND review.reviewed_at < ?
        AND EXISTS (
          SELECT 1
          FROM owners AS owner
          WHERE owner.owner = review.owner
            AND owner.kind = 'user'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM repos AS r
          JOIN skills AS s
            ON s.owner = r.owner
           AND s.repo = r.repo
          WHERE r.owner = review.owner
            AND r.repo = review.repo
            AND r.broken_since IS NULL
        )
      ORDER BY review.reviewed_at, review.owner, review.repo
    `).bind(input.now - SKILL_REPO_APPROVAL_STUCK_SECONDS).all<StuckApprovalRow>(),
  ])

  return {
    candidates: (candidateResult.results ?? []).map(row => ({
      owner: row.owner,
      repo: row.repo,
      stars: row.stars,
      skillCount: row.skill_count,
      pushedAt: row.pushed_at,
    })),
    decisions: (decisionResult.results ?? []).map(row => ({
      owner: row.owner,
      repo: row.repo,
      status: row.status,
      reason: row.reason,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      visibility: row.visible === 1 ? 'visible' : 'pending',
    })),
    stuckApprovals: (stuckResult.results ?? []).map(row => ({
      owner: row.owner,
      repo: row.repo,
      reason: row.reason,
      reviewedAt: row.reviewed_at,
    })),
  }
}

export type RecordSkillRepoReviewResult
  = | { _tag: 'eligible_visible' }
    | { _tag: 'eligible_sync_required' }
    | { _tag: 'owner_not_individual' }
    | { _tag: 'rejected' }

export async function recordSkillRepoReview(
  db: D1Database,
  input: {
    owner: string
    repo: string
    status: SkillRepoReviewStatus
    reason: string
    reviewedBy: string
    reviewedAt: number
  },
): Promise<RecordSkillRepoReviewResult> {
  if (input.status === 'eligible') {
    const owner = await db.prepare(`
      SELECT kind
      FROM owners
      WHERE owner = ?
    `).bind(input.owner).first<OwnerKindRow>()

    if (owner?.kind !== 'user')
      return { _tag: 'owner_not_individual' }
  }

  await db.prepare(`
    INSERT INTO skill_repo_eligibility (
      owner, repo, status, reason, reviewed_by, reviewed_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner, repo) DO UPDATE SET
      status = excluded.status,
      reason = excluded.reason,
      reviewed_by = excluded.reviewed_by,
      reviewed_at = excluded.reviewed_at
  `).bind(
    input.owner,
    input.repo,
    input.status,
    input.reason,
    input.reviewedBy,
    input.reviewedAt,
  ).run()

  if (input.status === 'rejected')
    return { _tag: 'rejected' }

  const visibility = await db.prepare(`
    SELECT CASE WHEN EXISTS (
      SELECT 1
      FROM repos AS r
      JOIN owners AS owner
        ON owner.owner = r.owner
       AND owner.kind = 'user'
      JOIN skills AS s
        ON s.owner = r.owner
       AND s.repo = r.repo
      WHERE r.owner = ?
        AND r.repo = ?
        AND r.broken_since IS NULL
    ) THEN 1 ELSE 0 END AS visible
  `).bind(input.owner, input.repo).first<VisibilityRow>()

  return visibility?.visible === 1
    ? { _tag: 'eligible_visible' }
    : { _tag: 'eligible_sync_required' }
}
