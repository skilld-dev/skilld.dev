/** Browse placement only. This does not admit a repository or grant trust. */
export const SKILLS_DIRECTORY_FOCUS_SQL = `
  EXISTS (
    SELECT 1 FROM skill_repo_focus AS focus
    JOIN owners AS maintainer ON maintainer.owner = focus.owner
    WHERE focus.owner = s.owner AND focus.repo = s.repo
      AND maintainer.kind = 'user'
      AND focus.probability >= 0.8
      AND NOT EXISTS (
        SELECT 1 FROM skill_repo_eligibility AS review
        WHERE review.owner = focus.owner AND review.repo = focus.repo
          AND review.status = 'rejected'
      )
  )
`
