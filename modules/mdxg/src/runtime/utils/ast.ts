import type { MDCElement, MDCNode, MDCRoot } from '../types'

export function isElement(node: MDCNode): node is MDCElement {
  return node.type === 'element'
}

export function isHeading(node: MDCNode): node is MDCElement & { tag: `h${1 | 2 | 3 | 4 | 5 | 6}` } {
  return isElement(node) && /^h[1-6]$/.test(node.tag)
}

export function headingDepth(el: MDCElement): 1 | 2 | 3 | 4 | 5 | 6 {
  return Number(el.tag.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6
}

// Flatten an MDC sub-tree to plain text (used for titles, search index).
export function toText(node: MDCNode | MDCRoot): string {
  if (node.type === 'text')
    return node.value
  if (node.type === 'comment')
    return ''
  const out: string[] = []
  for (const child of (node as MDCElement | MDCRoot).children ?? [])
    out.push(toText(child))
  return out.join('')
}
