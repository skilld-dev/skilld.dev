/**
 * Behavior readings, as artifact delivery answers them at
 * `GET /api/behavior-readings`.
 *
 * A behavior reading is a language model's reading of one match of a
 * behavior that needs approval: what the matched line does where it stands,
 * and why. It annotates the match. It never removes the approval: the skilld
 * CLI gates on its own pattern match, and nothing a model says reaches that.
 */

export const BEHAVIOR_VERDICTS = ['instruction', 'quoted-example', 'prohibition', 'documentation', 'unclear'] as const

export type BehaviorVerdict = typeof BEHAVIOR_VERDICTS[number]

export interface BehaviorReading {
  /** The file inside the Skill folder, such as `SKILL.md`. */
  path: string
  line: number
  /** The behavior id, such as `remote-code`. */
  behavior: string
  /** {@link behaviorLineHash} of the matched line, so a reader can tell the line moved. */
  lineHash: string
  verdict: BehaviorVerdict
  /** At most 20 words. Null when the model gave no usable reason. */
  reason: string | null
}

export interface BehaviorReadingsResponse {
  items: BehaviorReading[]
}

const VERDICT_LABELS: Readonly<Record<BehaviorVerdict, string>> = {
  'instruction': 'Instruction',
  'quoted-example': 'Quoted example',
  'prohibition': 'Prohibition',
  'documentation': 'Documentation',
  'unclear': 'Unclear',
}

export function behaviorVerdictLabel(verdict: BehaviorVerdict): string {
  return VERDICT_LABELS[verdict]
}

/**
 * A short, stable hash of one line: FNV-1a over its UTF-16 code units. It is
 * no security measure. It only lets the Skill page drop a reading whose line
 * no longer reads the same, and it runs the same in a Worker and a browser.
 */
export function behaviorLineHash(line: string): string {
  let hash = 0x811C9DC5
  for (let index = 0; index < line.length; index++) {
    hash ^= line.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * The lines of a file as the skilld behavior rules number them: split on
 * `\n`, a `\r` before it dropped, no empty line after a final newline, and a
 * leading byte order mark removed.
 */
export function behaviorLines(text: string): string[] {
  const body = text.startsWith('﻿') ? text.slice(1) : text
  if (body === '')
    return []
  const lines = body.split('\n').map((line, index, all) => index < all.length - 1 && line.endsWith('\r') ? line.slice(0, -1) : line)
  if (body.endsWith('\n'))
    lines.pop()
  return lines
}

/**
 * The SKILL.md readings that still fit the SKILL.md a page shows: same
 * line number, same line text. The registry syncs SKILL.md on its own
 * schedule, so its copy can differ from the reviewed commit.
 */
export function readingsForSkillMd(readings: readonly BehaviorReading[], raw: string): BehaviorReading[] {
  const lines = behaviorLines(raw)
  return readings.filter((reading) => {
    const line = lines[reading.line - 1]
    return reading.path === 'SKILL.md' && line !== undefined && behaviorLineHash(line) === reading.lineHash
  })
}
