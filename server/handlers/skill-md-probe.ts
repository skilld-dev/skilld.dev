import { skillsRawPathFromProbe } from '#shared/skill-md-probe'

/**
 * Send a raw-layout guess to the markdown it was looking for.
 *
 * Redirecting without checking the skill exists is deliberate: this runs on
 * every request, and `/api/skills-raw` already answers 404 for a skill we do
 * not hold. An uncached D1 read here would repeat the 2026-08-04 overload.
 */
export default defineEventHandler((event) => {
  const target = skillsRawPathFromProbe(getRequestURL(event).pathname)
  if (target)
    return sendRedirect(event, target, 301)
})
