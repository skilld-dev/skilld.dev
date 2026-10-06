import type { RegistrySkill } from '../../utils/skills-registry'
import { defineApiHandler } from '#shared/server/handler'
import { officialRepos } from '../../data/official-repos'
import { makeTaskSearchPresenter } from '../../presenters/task-search'
import { TaskSearchBody } from '../../schemas/skills-query'
import { findSkillsByKeys } from '../../utils/skills-registry'
import { taskSearchDeps } from '../../utils/task-search-deps'
import { searchForTask } from '../../utils/task-search-run'

const officialOwners = new Set(officialRepos.map(r => r.owner))

function keyOf(ref: string): { owner: string, repo: string, name: string } {
  const [owner = '', repo = '', ...name] = ref.split('/')
  return { owner, repo, name: name.join('/') }
}

/**
 * Task search: the search box's opt-in answer for a sentence. A model runs a
 * few registry searches and keeps the Skills that fit.
 *
 * Public, so no policy. POST, because each answer the cache misses spends
 * model credits, and a crawler or prefetch never sends one. The visitor and
 * daily limits live in `searchForTask`.
 */
export default defineApiHandler({
  schema: TaskSearchBody,
  handler: async ({ event, body, platform }) => {
    const outcome = await searchForTask(taskSearchDeps(event, platform), body.q)
    if (outcome._tag !== 'found')
      return { outcome, skills: [] }
    const rows = await findSkillsByKeys(event, outcome.refs.map(keyOf))
    const skills = outcome.refs.map(ref => rows.get(ref)).filter((skill): skill is RegistrySkill => skill !== undefined)
    return { outcome, skills }
  },
  presenter: makeTaskSearchPresenter(officialOwners),
})
