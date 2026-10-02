/**
 * Finds eyebrow text in a Vue single-file component.
 *
 * An eyebrow is a muted uppercase label stacked directly above a heading. It
 * repeats what the heading already says, so DESIGN.md bans it: delete it,
 * promote it into the heading, or demote it to a data line below.
 *
 * Detection is structural, not textual. A label is an element carrying
 * `.section-label` or `.data-label`. It is an eyebrow only when its next
 * element sibling is a heading. The same classes are correct as a small
 * section heading, as a group label in a list or menu, and as a data line
 * below a heading, so class alone proves nothing.
 *
 * Pure so the rule is testable without a filesystem or a browser.
 */

export interface EyebrowFinding {
  /** 1-indexed line of the label element. */
  readonly line: number
  /** The heading tag the label sits above, for the report. */
  readonly heading: string
  /** First line of the label's own content, trimmed. */
  readonly text: string
}

const LABEL_CLASS = /class="[^"]*\b(?:section-label|data-label)\b/
const HEADING_TAG = /^h[1-6]$/
// Attributes must start with whitespace, which keeps them from competing
// with the tag name for the same characters.
const TAG = /<(\/)?([a-z][\w.-]*)((?:\s(?:"[^"]*"|'[^']*'|[^>"'])*)?)>/gi

/**
 * Elements that never have children, so they never open a depth level.
 * A trailing slash in the attribute run marks a self-closing element.
 */
const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
])

/** Blocks whose contents are not markup, so tag scanning must skip them. */
function stripNonTemplateBlocks(source: string): string {
  return source.replace(
    /<(script|style)(?:"[^"]*"|'[^']*'|[^>])*>[\s\S]*?<\/\1>/gi,
    block => block.replace(/[^\n]/g, ' '),
  )
}

function lineAt(source: string, index: number): number {
  let line = 1
  for (let i = 0; i < index; i++) {
    if (source[i] === '\n')
      line++
  }
  return line
}

function firstContentLine(source: string, from: number): string {
  const next = source.indexOf('<', from)
  const inner = source.slice(from, next === -1 ? source.length : next)
  return inner.split('\n').map(part => part.trim()).find(Boolean) ?? ''
}

/**
 * A label followed by a heading sibling, for every such pair in the file.
 * Returns an empty array for a file with no template.
 */
export function findEyebrows(source: string): EyebrowFinding[] {
  const template = stripNonTemplateBlocks(source)
  const findings: EyebrowFinding[] = []

  /** Labels still waiting to see what follows them, innermost last. */
  let pending: { depth: number, line: number, text: string } | null = null
  let depth = 0
  TAG.lastIndex = 0

  for (let match = TAG.exec(template); match; match = TAG.exec(template)) {
    const [tag, closing, name, attrs] = match
    const lower = name.toLowerCase()
    const isVoid = attrs.trimEnd().endsWith('/') || VOID_TAGS.has(lower)

    if (closing) {
      depth--
      // The label's parent closed with no sibling after it, so nothing follows it.
      if (pending && depth < pending.depth)
        pending = null
      continue
    }

    // The first element opened after a label closes is its next sibling.
    if (pending && depth === pending.depth) {
      if (HEADING_TAG.test(lower)) {
        findings.push({ line: pending.line, heading: lower, text: pending.text })
      }
      pending = null
    }

    if (!isVoid && LABEL_CLASS.test(attrs)) {
      const contentStart = match.index + tag.length
      pending = {
        depth,
        line: lineAt(template, match.index),
        text: firstContentLine(template, contentStart),
      }
    }

    if (!isVoid)
      depth++
  }

  return findings
}
