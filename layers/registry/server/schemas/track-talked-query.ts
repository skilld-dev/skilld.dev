import { z } from 'zod'
import { DEFAULT_TRACK_RANGE } from '#shared/track-board'

/** `?range=` on a track's talked list. The page parses its own query into one of these. */
export const TrackTalkedQuery = z.object({
  range: z.enum(['week', 'month']).default(DEFAULT_TRACK_RANGE),
})

export type TrackTalkedQuery = z.infer<typeof TrackTalkedQuery>
