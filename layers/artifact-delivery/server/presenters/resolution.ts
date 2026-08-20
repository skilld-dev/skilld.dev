import type { ResolutionRow } from '../utils/state'
import { presentResolution } from '../utils/state'

export function presentArtifactResolution(row: ResolutionRow) {
  return presentResolution(row)
}
