export function featuredCollectionSkillsSql(placeholders: string): string {
  return `WITH ranked_collection_skills AS (
            SELECT cs.collection_id, cs.position, cs.owner, cs.repo, cs.reason,
                   s.name, s.display_name,
                   ROW_NUMBER() OVER (
                     PARTITION BY cs.collection_id, cs.position
                     ORDER BY s.installs DESC, s.name ASC
                   ) AS rn
            FROM collection_skills_v2 cs
            JOIN skills s
              ON s.owner = cs.owner
             AND s.repo = cs.repo
             AND (cs.name IS NULL OR s.name = cs.name)
            JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
            WHERE cs.collection_id IN (${placeholders})
              AND (r.broken_since IS NULL OR r.broken_since > unixepoch() - 604800)
              AND s.trust_tier IN ('official', 'trusted-curator')
              AND s.source_resolved = 1
              AND s.rendered_status = 'ok'
          )
          SELECT collection_id, position, owner, repo, name, display_name, reason
          FROM ranked_collection_skills
          WHERE rn = 1
          ORDER BY collection_id ASC, position ASC`
}
