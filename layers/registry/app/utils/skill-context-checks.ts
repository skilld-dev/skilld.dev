/** Source-only checks. No local Agent configuration or complete listing is available here. */
export interface SkillContextCheck {
  code: 'frontmatter' | 'name' | 'description' | 'codex-description-cap' | 'claude-description-cap' | 'listing-share'
  tone: 'warning' | 'error'
  message: string
}

type ClaudeListing
  = | { _tag: 'unavailable' }
    | { _tag: 'explicit-only' }
    | { _tag: 'listed', characters: number, percent: number }

// Versioned observations, not tokenizer counts or a visitor's configured allowance.
// https://github.com/smol-ai/skit/blob/08ff55d9d995b402ebd29c51bdedbe5690b9b0e0/docs/skill-context-budgets.md
// Codex 0.160.1: 1,024 code points; Claude Code 2.1.292: 1,536 combined code points.
const CODEX_DESCRIPTION_CAP = 1024
const CLAUDE_DESCRIPTION_CAP = 1536
const CLAUDE_EXAMPLE_ALLOWANCE = 8000 // 200,000 context tokens × 4 characters × 1%.

export function resolveSkillContextChecks(input: {
  raw: string | null
  frontmatter: Record<string, unknown> | null
}): { checks: SkillContextCheck[], claudeListing: ClaudeListing } {
  const checks: SkillContextCheck[] = []
  if (!input.raw)
    return { checks, claudeListing: { _tag: 'unavailable' } }
  const fields = input.frontmatter
  if (!fields) {
    checks.push({ code: 'frontmatter', tone: 'error', message: 'SKILL.md needs a valid YAML header with a name and description.' })
    return { checks, claudeListing: { _tag: 'unavailable' } }
  }
  const name = typeof fields.name === 'string' ? fields.name.trim() : ''
  const description = typeof fields.description === 'string' ? fields.description.trim() : ''
  if (!name)
    checks.push({ code: 'name', tone: 'error', message: 'The name in the SKILL.md header is missing or is not text.' })
  if (!description)
    checks.push({ code: 'description', tone: 'error', message: 'The description in the SKILL.md header is missing or is not text.' })
  if (!name || !description)
    return { checks, claudeListing: { _tag: 'unavailable' } }

  if (Array.from(description).length > CODEX_DESCRIPTION_CAP)
    checks.push({ code: 'codex-description-cap', tone: 'warning', message: 'Codex shortens descriptions longer than 1,024 characters. Put when-to-use details first.' })

  const explicitOnly = fields['disable-model-invocation'] === true || fields['disable-model-invocation'] === 'true'
  if (explicitOnly)
    return { checks, claudeListing: { _tag: 'explicit-only' } }

  const combined = [description, typeof fields.when_to_use === 'string' ? fields.when_to_use : ''].filter(Boolean).join(' ').trim()
  const combinedCharacters = Array.from(combined)
  if (combinedCharacters.length > CLAUDE_DESCRIPTION_CAP)
    checks.push({ code: 'claude-description-cap', tone: 'warning', message: 'Claude Code shortens description plus when_to_use after 1,536 characters by default. Put when-to-use details first.' })

  // Matches Skit's estimated name, separator, capped description, and newline row.
  const characters = Array.from(`${name}: ${combinedCharacters.slice(0, CLAUDE_DESCRIPTION_CAP).join('')}\n`).length
  const percent = characters / CLAUDE_EXAMPLE_ALLOWANCE * 100
  if (characters * 100 > CLAUDE_EXAMPLE_ALLOWANCE)
    checks.push({ code: 'listing-share', tone: 'warning', message: 'A shorter description leaves more room for other Skills. This entry exceeds our 1% size suggestion.' })
  return { checks, claudeListing: { _tag: 'listed', characters, percent } }
}
