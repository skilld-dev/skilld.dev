import type { ResolutionRow } from './state'
import { ACTIVE_BUILD_STATES } from './state'

/** The longest one Resolution read waits for its build to move. */
export const RESOLUTION_WAIT_MS = 8_000

/** How often a waiting read loads the Resolution again. */
export const RESOLUTION_CHECK_MS = 250

export interface ResolutionWaitDependencies {
  /** Load the Resolution as D1 holds it now. */
  load: () => Promise<ResolutionRow | null>
  sleep: (milliseconds: number) => Promise<void>
  /** Milliseconds since the epoch. */
  now: () => number
}

/**
 * The Resolution once its build leaves the state it had, or as it stands
 * when the wait runs out.
 *
 * A read used to answer at once, and the CLI came back a second later. A
 * build that finished just after a read cost the run up to that second, and a
 * Resolution passes through seven states. A held read answers within one
 * check of each change, so the CLI sees `ready` about 250 ms after it lands.
 * A settled Resolution answers at once.
 */
export async function waitForResolutionChange(
  dependencies: ResolutionWaitDependencies,
  row: ResolutionRow,
  budgetMs: number = RESOLUTION_WAIT_MS,
): Promise<ResolutionRow> {
  if (!isBuilding(row))
    return row
  const deadline = dependencies.now() + budgetMs
  let current = row
  while (dependencies.now() + RESOLUTION_CHECK_MS <= deadline) {
    await dependencies.sleep(RESOLUTION_CHECK_MS)
    const next = await dependencies.load()
    if (!next)
      return current
    current = next
    if (current.state !== row.state)
      return current
  }
  return current
}

function isBuilding(row: ResolutionRow): boolean {
  return (ACTIVE_BUILD_STATES as readonly string[]).includes(row.state)
}
