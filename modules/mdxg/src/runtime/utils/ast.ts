import type { ElementNode, MarkdownDocument, Node } from 'comark'

export function isElement(node: Node): node is ElementNode {
  return Array.isArray(node) && typeof node[0] === 'string'
}

export function isHeading(node: Node): node is ElementNode {
  return isElement(node) && /^h[1-6]$/.test(node[0])
}

export function headingDepth(element: ElementNode): 1 | 2 | 3 | 4 | 5 | 6 {
  return Number(element[0].slice(1)) as 1 | 2 | 3 | 4 | 5 | 6
}

export function toText(input: Node | MarkdownDocument): string {
  if (typeof input === 'string')
    return input
  if (!Array.isArray(input))
    return input.nodes.map(toText).join('')
  if (input[0] === null)
    return ''
  return input.slice(2).map(node => toText(node as Node)).join('')
}
