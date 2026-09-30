interface SkillFile {
  path: string
  size: number
  type: 'markdown' | 'code' | 'image' | 'data' | 'other'
}

/**
 * What a Skill costs an Agent's context at each loading stage of the Agent
 * Skills spec. The name and description load in every session, the SKILL.md
 * body loads when the Agent uses the Skill, and the other Markdown and data
 * files load only when the body sends the Agent to them.
 */
export interface SkillContextCost {
  fileCount: number
  totalBytes: number
  tokens: {
    metadata: number
    instructions: number
    resources: number
  }
  /** Markdown and data files outside SKILL.md, the ones behind `resources`. */
  resourceFileCount: number
}

/** How one file in the Skill folder reaches the Agent's context. */
export type SkillFileContext
  = | { _tag: 'resource', tokens: number }
    | { _tag: 'script' }
    | { _tag: 'unread' }

// Roughly four bytes per token for English prose. The UI prints every count
// with "≈", so this only has to hold the order of magnitude.
const BYTES_PER_TOKEN = 4
// The Agent reads Markdown and data into context. It runs scripts through a
// shell, so only their output lands in context. The API types any text file as
// `code`, LICENSE.txt included, so scripts go by extension.
const READ_TYPES = new Set<SkillFile['type']>(['markdown', 'data'])
const SCRIPT_PATH = /\.(?:py|sh|bash|zsh|js|mjs|cjs|ts|rb|go|ps1|php|pl)$/i
const LICENSE_PATH = /(?:^|\/)licen[cs]e(?:\.\w+)?$/i
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/

const encoder = new TextEncoder()

function byteLength(text: string): number {
  return encoder.encode(text).byteLength
}

function tokensFor(bytes: number): number {
  return Math.ceil(bytes / BYTES_PER_TOKEN)
}

export function resolveSkillContextCost(input: {
  raw: string | null
  name: string
  description: string | null
  files: SkillFile[]
}): SkillContextCost {
  const skillMdBytes = input.raw ? byteLength(input.raw) : 0
  const body = input.raw?.replace(FRONTMATTER, '') ?? ''
  const others = input.files.filter(file => file.path !== 'SKILL.md')
  const resources = others.filter(file => resolveSkillFileContext(file)._tag === 'resource')
  const resourceBytes = resources.reduce((sum, file) => sum + file.size, 0)
  return {
    fileCount: others.length + 1,
    totalBytes: skillMdBytes + others.reduce((sum, file) => sum + file.size, 0),
    tokens: {
      metadata: tokensFor(byteLength(`${input.name}\n${input.description ?? ''}`)),
      instructions: tokensFor(byteLength(body.trim())),
      resources: tokensFor(resourceBytes),
    },
    resourceFileCount: resources.length,
  }
}

export function resolveSkillFileContext(file: SkillFile): SkillFileContext {
  if (LICENSE_PATH.test(file.path))
    return { _tag: 'unread' }
  if (READ_TYPES.has(file.type))
    return { _tag: 'resource', tokens: tokensFor(file.size) }
  if (SCRIPT_PATH.test(file.path))
    return { _tag: 'script' }
  return { _tag: 'unread' }
}

export function formatTokenCount(tokens: number): string {
  if (tokens < 1000)
    return `≈${tokens}`
  const thousands = tokens / 1000
  return `≈${thousands < 10 ? thousands.toFixed(1).replace(/\.0$/, '') : Math.round(thousands)}k`
}

export function formatByteSize(bytes: number): string {
  if (bytes < 1024)
    return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1).replace(/\.0$/, '')} KB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, '')} MB`
}
