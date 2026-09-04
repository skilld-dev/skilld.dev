import { describe, expect, it } from 'vitest'
import { holdsAsCharting } from '../../scripts/backfill-diagramming-category'

describe('holdsAsCharting', () => {
  it('holds a chart skill the classifier called diagramming', () => {
    expect(holdsAsCharting('choosing-trend-or-slope-view Pick the right chart view for a trend in the dashboard.')).toBe(true)
    expect(holdsAsCharting('claude-d3js-skill Creating interactive data visualisations using d3.js.')).toBe(true)
  })

  it('lets a structural diagram through even when it mentions charts', () => {
    expect(holdsAsCharting('diagram-design Create branded architecture, flowchart, sequence and quadrant chart diagrams.')).toBe(false)
    expect(holdsAsCharting('archify Create validated architecture, workflow and data-flow diagrams as standalone HTML.')).toBe(false)
  })

  it('lets a skill with no charting language through', () => {
    expect(holdsAsCharting('cartographer Maps and documents codebases by orchestrating parallel subagents.')).toBe(false)
  })
})
