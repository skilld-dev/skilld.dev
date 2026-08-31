/**
 * Who belongs to a category page.
 *
 * The first rule was `is_abstract = 1`, and the classifier answers "abstract"
 * for roughly 4% of skills. Whole tracks came out at two or three skills:
 * `release-management` and `scraping` have no abstract skill at all, `ci-cd`
 * has two out of a thousand. A track that lists three skills reads as a broken
 * page, not as curation.
 *
 * So membership is abstract-first with a backfill. Every abstract skill in the
 * category is a member, because that classification is the curation signal.
 * Under it sit the top `CLUSTER_BACKFILL_PER_CATEGORY` package-specific skills
 * of the same category by stars, which is what stops a track from rendering
 * empty. The backfill is capped rather than unbounded: `deployment` holds 1,363
 * skills, and listing all of them is the scaled-content failure mode from
 * 2026-06 rather than a category page.
 *
 * `seo_indexable` gates the backfill for the same reason. An abstract skill
 * earns its place by classification; a package-specific one has to already
 * clear the indexability bar.
 */

import type { ParsedClusterSkillKey } from './cluster-skill-curation'

/** D1 rejects a statement that binds more than this many parameters. */
export const D1_BOUND_PARAMETER_LIMIT = 100

/** Backfill depth per classifier category, not per track. */
export const CLUSTER_BACKFILL_PER_CATEGORY = 40

/**
 * How many skills one repository may contribute to one classifier category.
 *
 * Without it the ranking is pure stars, and a repo that ships 60 skills owns
 * the page: `/skills/design` opened with six `mattpocock/skills` rows and
 * `/skills/coding` with four from `github/awesome-copilot`. Pinned skills are
 * exempt.
 */
export const CLUSTER_MAX_PER_REPO = 3

export interface ClusterMemberSql {
  sql: string
  params: string[]
}

function placeholders(count: number): string {
  return Array.from({ length: count }).fill('?').join(',')
}

/**
 * Rows for one or more classifier categories, plus any pinned skill, already
 * filtered to members. Ordering is left to the caller.
 *
 * `columns` is interpolated, so it must stay a literal in caller code. The
 * category and pinned values are bound.
 */
export function clusterMembersSql(
  columns: string,
  categories: string[],
  pinnedKeys: string[],
): ClusterMemberSql {
  const arms: string[] = []
  const whereParams: string[] = []

  if (categories.length) {
    arms.push(`(s.abstractness_category IN (${placeholders(categories.length)}) AND (s.is_abstract = 1 OR s.seo_indexable = 1))`)
    whereParams.push(...categories)
  }
  if (pinnedKeys.length) {
    arms.push(`(s.owner || '/' || s.name IN (${placeholders(pinnedKeys.length)}))`)
    whereParams.push(...pinnedKeys)
  }
  if (!arms.length)
    throw new Error('clusterMembersSql needs at least one category or pinned key')

  // Only a query with both arms has to tell them apart. A pinned-only query
  // matches nothing else, so it skips the CASE rather than binding every key
  // twice: D1 caps one statement at 100 bound parameters.
  const needsPinnedCase = Boolean(pinnedKeys.length && categories.length)
  const pinnedArm = needsPinnedCase
    ? `CASE WHEN s.owner || '/' || s.name IN (${placeholders(pinnedKeys.length)}) THEN 1 ELSE 0 END`
    : (pinnedKeys.length ? '1' : '0')
  // D1 binds by position in the statement text, and the pinned CASE sits in the
  // SELECT list, ahead of the WHERE arms.
  const params: string[] = [...(needsPinnedCase ? pinnedKeys : []), ...whereParams]

  // Two windows, two different jobs. `category_rank` ranks every row of a
  // category, abstract included, so the backfill is "the category's most-starred
  // work" rather than "the most starred of whatever the classifier rejected".
  // `repo_rank` then caps how much of a track any one repository can be: a repo
  // that ships 60 skills would otherwise take the whole first page, and a track
  // reading as one vendor's index is the thing these pages exist to avoid. Pins
  // are exempt, because a human already chose them.
  const sql = `
    SELECT ${columns}
    FROM (
      SELECT s.owner, s.name, s.repo, s.display_name, s.description,
             s.modified_at, r.stars,
             (SELECT COUNT(*) FROM skills repo_skills
              WHERE repo_skills.owner = s.owner
                AND repo_skills.repo = s.repo
                AND repo_skills.source_resolved = 1) AS repo_skill_count,
             s.abstractness_category AS category,
             COALESCE(s.is_abstract, 0) AS is_abstract,
             ${pinnedArm} AS is_pinned,
             ROW_NUMBER() OVER (
               PARTITION BY s.abstractness_category
               ORDER BY r.stars DESC, s.name ASC
             ) AS category_rank,
             ROW_NUMBER() OVER (
               PARTITION BY s.abstractness_category, s.owner, s.repo
               ORDER BY COALESCE(s.is_abstract, 0) DESC, r.stars DESC, s.name ASC
             ) AS repo_rank
      FROM skills s
      JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
      WHERE ${arms.join(' OR ')}
    )
    WHERE is_pinned = 1
       OR (repo_rank <= ${CLUSTER_MAX_PER_REPO}
           AND (is_abstract = 1 OR category_rank <= ${CLUSTER_BACKFILL_PER_CATEGORY}))
  `

  return { sql, params }
}

export interface ClusterPageWindow {
  limit: number
  offset: number
}

export interface ClusterPageSql {
  countSql: string
  countParams: (string | number)[]
  listSql: string
  listParams: (string | number)[]
}

/**
 * The two statements one `/skills/<slug>` page sends.
 *
 * They live here rather than in the route because the membership fragment is
 * not what D1 counts. A pinned key is bound once in the SELECT `CASE`, once in
 * the WHERE arm, and twice more in the ORDER BY `CASE`, so a guard on the
 * fragment reads a quarter of the real parameter count.
 */
export function clusterPageSql(
  columns: string,
  categories: string[],
  pinnedSkills: ParsedClusterSkillKey[],
  pageWindow: ClusterPageWindow,
): ClusterPageSql {
  const members = clusterMembersSql(columns, categories, pinnedSkills.map(skill => skill.key))

  // `CASE` with no `WHEN` is a syntax error, so a category that ranks purely on
  // stars drops the pinned-order arm rather than emitting an empty CASE.
  const pinnedOrderSql = pinnedSkills.length
    ? `CASE
      ${pinnedSkills.map((_, index) => `WHEN owner = ? AND name = ? THEN ${index}`).join('\n')}
      ELSE ${pinnedSkills.length}
    END,`
    : ''

  return {
    countSql: `SELECT COUNT(*) AS n FROM (${members.sql})`,
    countParams: [...members.params],
    listSql: `
    SELECT * FROM (${members.sql})
    ORDER BY ${pinnedOrderSql} is_abstract DESC, stars DESC, modified_at DESC, name ASC
    LIMIT ? OFFSET ?
  `,
    listParams: [
      ...members.params,
      ...pinnedSkills.flatMap(skill => [skill.owner, skill.name]),
      pageWindow.limit,
      pageWindow.offset,
    ],
  }
}
