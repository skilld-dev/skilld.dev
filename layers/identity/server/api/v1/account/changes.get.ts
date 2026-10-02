import { changesV1 } from 'skilld-sdk/contract'
import { defineApiOperation, operationFailure } from '#shared/server/operation'
import { loadSkillCardRows } from '#shared/server/skill-cards'
import { changedSkillRefs, presentAccountChanges } from '../../../presenters/account-v1'
import { selectAccountChanges } from '../../../utils/account-changes'
import { getUserById } from '../../../utils/users'

const DEFAULT_WINDOW_SECONDS = 30 * 24 * 60 * 60

export default defineApiOperation({
  operation: changesV1.operations.list,
  handler: async ({ event, platform, input, user }) => {
    const row = await getUserById(event, user.id)
    if (!row)
      return operationFailure('AUTH_REQUIRED', 'This account no longer exists. Sign in again.')
    const now = Math.floor(Date.now() / 1000)
    const requested = input.query.since === undefined
      ? now - DEFAULT_WINDOW_SECONDS
      : Math.floor(Date.parse(input.query.since) / 1000)
    const since = Math.min(Math.max(0, requested), now)
    const selection = await selectAccountChanges(platform.db, row, since, now)
    return presentAccountChanges(selection, await loadSkillCardRows(platform.db, changedSkillRefs(selection)))
  },
})
