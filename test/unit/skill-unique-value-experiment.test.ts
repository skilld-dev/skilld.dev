import { describe, expect, it } from 'vitest'
import {
  isUniqueValueTreatment,
  UNIQUE_VALUE_EXPERIMENT,
} from '../../layers/registry/app/utils/skill-unique-value-experiment'

describe('unique value experiment gate', () => {
  it('treats every listed treatment Skill', () => {
    for (const slug of UNIQUE_VALUE_EXPERIMENT.treatment)
      expect(isUniqueValueTreatment(slug)).toBe(true)
  })

  it('leaves every listed control Skill unchanged', () => {
    for (const slug of UNIQUE_VALUE_EXPERIMENT.control)
      expect(isUniqueValueTreatment(slug)).toBe(false)
  })

  it('leaves a Skill outside both lists unchanged', () => {
    expect(isUniqueValueTreatment('someone/else/not-listed')).toBe(false)
  })

  it('ignores letter case, because GitHub logins ignore it', () => {
    const [first] = UNIQUE_VALUE_EXPERIMENT.treatment
    expect(isUniqueValueTreatment(first!.toUpperCase())).toBe(true)
  })

  it('keeps the two groups the same size and apart', () => {
    const { treatment, control } = UNIQUE_VALUE_EXPERIMENT
    expect(treatment).toHaveLength(10)
    expect(control).toHaveLength(10)
    expect(new Set([...treatment, ...control].map(s => s.toLowerCase())).size).toBe(20)
  })
})
