import type { ArtifactFile, CheckResult, ResolvedSource } from '../schemas/contracts'
import type { ArtifactSourceFile } from './github-source'
import { digestHex } from './encoding'
import { ARTIFACT_POLICY_VERSION } from './state'

/**
 * 2026-10-07: the check became advisory. It still reports every finding, but
 * no finding blocks delivery. The registry admits a Skill by its folder, so a
 * frontmatter name, a long description or a missing field never changes which
 * Skill runs. Safety checks stay required.
 */
const AGENT_SKILLS_CHECK_VERSION = '2026-10-07'
const MAX_DESCRIPTION_CHARACTERS = 1024
const PATH_POLICY_VERSION = '1'
const CREDENTIAL_MATERIAL_VERSION = '1'
const EXECUTABLE_FILES_VERSION = '1'

/** The checks a statement under one policy carries, by check name. */
export type ArtifactCheckSet = ReadonlyMap<string, { version: string, required: boolean }>

const CURRENT_ARTIFACT_CHECKS: ArtifactCheckSet = new Map([
  ['path-policy', { version: PATH_POLICY_VERSION, required: true }],
  ['agent-skills-spec', { version: AGENT_SKILLS_CHECK_VERSION, required: false }],
  ['credential-material', { version: CREDENTIAL_MATERIAL_VERSION, required: true }],
  ['executable-files', { version: EXECUTABLE_FILES_VERSION, required: false }],
])

/**
 * Every policy the artifact signer signs, with the checks its statements carry.
 *
 * The deploy updates the signer before the site, and a failed smoke rolls the
 * site back alone. In both windows the running site stages statements under
 * the policy before the signer's, so the signer signs that one too. When you
 * bump `ARTIFACT_POLICY_VERSION`, replace the previous entry with the policy
 * you bumped from. Leave it out only when the bump closes a safety gap, so the
 * signer refuses the old policy at once.
 *
 * The site never reuses a build under another policy, so a statement signed
 * under the previous one only finishes a run already in flight.
 */
export const SIGNABLE_ARTIFACT_POLICIES: ReadonlyMap<string, ArtifactCheckSet> = new Map([
  [ARTIFACT_POLICY_VERSION, CURRENT_ARTIFACT_CHECKS],
  ['2026-08-20.1', new Map([
    ['path-policy', { version: '1', required: true }],
    ['agent-skills-spec', { version: '2026-08-20', required: true }],
    ['credential-material', { version: '1', required: true }],
    ['executable-files', { version: '1', required: false }],
  ])],
])

export interface CheckedArtifactSource {
  files: ArtifactFile[]
  checkResults: CheckResult[]
}

export async function checkArtifactSource(
  source: ResolvedSource,
  files: ArtifactSourceFile[],
): Promise<CheckedArtifactSource> {
  const fileInventory = await Promise.all(files.map(async file => ({
    path: file.path,
    mode: file.mode,
    size: file.bytes.byteLength,
    sha256: await digestHex('SHA-256', file.bytes),
  } satisfies ArtifactFile)))
  const pathFindings = files
    .filter(file => !splitUstarPath(file.path))
    .map(file => file.path)
  const pathPolicy: CheckResult = pathFindings.length > 0
    ? {
        name: 'path-policy',
        version: PATH_POLICY_VERSION,
        outcome: 'fail',
        required: true,
        summary: 'A Skill path cannot be represented by the Artifact format.',
        findings: pathFindings,
      }
    : {
        name: 'path-policy',
        version: PATH_POLICY_VERSION,
        outcome: 'pass',
        required: true,
      }

  const skill = files.find(file => file.path === 'SKILL.md')
  const specFindings: string[] = []
  let decodedSkill = ''
  if (!skill) {
    specFindings.push('SKILL.md is missing.')
  }
  else {
    decodedSkill = decodeText(skill.bytes) ?? ''
    if (!decodedSkill) {
      specFindings.push('SKILL.md must contain UTF-8 text.')
    }
    else {
      const frontmatter = readSkillFrontmatter(decodedSkill)
      if (!frontmatter) {
        specFindings.push('SKILL.md must start with YAML frontmatter.')
      }
      else {
        const directoryName = source.skillPath === '.'
          ? source.repository
          : source.skillPath.split('/').at(-1)!
        if (!frontmatter.name)
          specFindings.push('The frontmatter has no name.')
        else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(frontmatter.name) || frontmatter.name.length > 64)
          specFindings.push(`The frontmatter name \`${frontmatter.name.slice(0, 100)}\` must use 1 to 64 lowercase letters, numbers, or single hyphens.`)
        else if (frontmatter.name !== directoryName)
          specFindings.push(`The frontmatter name \`${frontmatter.name}\` does not match the folder \`${directoryName}\`.`)
        if (!frontmatter.description)
          specFindings.push('The frontmatter has no description.')
        else if (frontmatter.description.length > MAX_DESCRIPTION_CHARACTERS)
          specFindings.push(`The description has ${frontmatter.description.length.toLocaleString('en-US')} characters. The limit is ${MAX_DESCRIPTION_CHARACTERS.toLocaleString('en-US')}.`)
      }
    }
  }
  const agentSkillsSpec: CheckResult = specFindings.length > 0
    ? {
        name: 'agent-skills-spec',
        version: AGENT_SKILLS_CHECK_VERSION,
        outcome: 'warn',
        required: false,
        summary: 'The Skill does not match the Agent Skills specification.',
        findings: specFindings,
      }
    : {
        name: 'agent-skills-spec',
        version: AGENT_SKILLS_CHECK_VERSION,
        outcome: 'pass',
        required: false,
      }

  const credentialFindings: string[] = []
  for (const file of files) {
    const text = decodeText(file.bytes)
    if (!text)
      continue
    if (/-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/.test(text))
      credentialFindings.push(`${file.path} contains private key material.`)
  }
  const credentialMaterial: CheckResult = credentialFindings.length > 0
    ? {
        name: 'credential-material',
        version: CREDENTIAL_MATERIAL_VERSION,
        outcome: 'fail',
        required: true,
        summary: 'The Skill contains private key material.',
        findings: credentialFindings,
      }
    : {
        name: 'credential-material',
        version: CREDENTIAL_MATERIAL_VERSION,
        outcome: 'pass',
        required: true,
      }

  const executableFindings = files.filter(file => file.mode === 493).map(file => file.path)
  const executableFiles: CheckResult = executableFindings.length > 0
    ? {
        name: 'executable-files',
        version: EXECUTABLE_FILES_VERSION,
        outcome: 'warn',
        required: false,
        summary: 'The Skill contains executable files.',
        findings: executableFindings,
      }
    : {
        name: 'executable-files',
        version: EXECUTABLE_FILES_VERSION,
        outcome: 'pass',
        required: false,
      }

  return {
    files: fileInventory,
    checkResults: [pathPolicy, agentSkillsSpec, credentialMaterial, executableFiles],
  }
}

export function checksBlockArtifact(checks: CheckResult[], checkSet: ArtifactCheckSet = CURRENT_ARTIFACT_CHECKS): boolean {
  const byName = new Map(checks.map(check => [check.name, check]))
  if (byName.size !== checks.length)
    return true
  for (const [name, expected] of checkSet) {
    const check = byName.get(name)
    if (!check || check.version !== expected.version || check.required !== expected.required)
      return true
  }
  return checks.some(check => check.required && (check.outcome === 'fail' || check.outcome === 'error'))
}

/** Whether checks permit signing under one policy. The current policy is the default. */
export function checksPermitSigning(checks: CheckResult[], policyVersion: string = ARTIFACT_POLICY_VERSION): boolean {
  const checkSet = SIGNABLE_ARTIFACT_POLICIES.get(policyVersion)
  return checkSet !== undefined
    && !checksBlockArtifact(checks, checkSet)
    && checks.every(check => !check.required || check.outcome === 'pass')
}

function decodeText(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)
  }
  catch {
    // Invalid UTF-8 is an expected check result.
    return null
  }
}

/**
 * Minimal frontmatter reader for the Agent Skills specification check.
 *
 * Deliberately not the registry parser in `layers/registry`: the signer worker
 * compiles this file on its own, so sharing that parser would pull a YAML
 * dependency into the signing path. This reader only needs to know whether
 * `name` and `description` are present and within their length bounds.
 */
function readSkillFrontmatter(raw: string): { name?: string, description?: string } | null {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match)
    return null
  const lines = match[1]!.split(/\r?\n/)
  const values: { name?: string, description?: string } = {}
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!
    const separator = line.indexOf(':')
    if (separator < 0)
      continue
    const key = line.slice(0, separator)
    if (key !== 'name' && key !== 'description')
      continue
    const value = line.slice(separator + 1).trim()
    // A block scalar (`>`, `|-`, `>+2`) or a plain scalar that continues on
    // indented lines. Reading `>-` as the value reported a two-character
    // description for Skills whose description is over a thousand.
    if (/^[>|][+-]?\d*$/.test(value) || value === '') {
      const continued: string[] = []
      while (index + 1 < lines.length && /^\s+/.test(lines[index + 1]!))
        continued.push(lines[++index]!.trim())
      values[key] = continued.join(value.startsWith('|') ? '\n' : ' ').trim()
    }
    else {
      values[key] = value.replace(/^(['"])([\s\S]*)\1$/, '$2').trim()
    }
  }
  return values
}

export function splitUstarPath(path: string): { name: string, prefix: string } | null {
  const encoder = new TextEncoder()
  if (encoder.encode(path).byteLength <= 100)
    return { name: path, prefix: '' }
  const separators = [...path.matchAll(/\//g)].map(match => match.index)
  for (let index = separators.length - 1; index >= 0; index--) {
    const separator = separators[index]!
    const prefix = path.slice(0, separator)
    const name = path.slice(separator + 1)
    if (encoder.encode(prefix).byteLength <= 155 && encoder.encode(name).byteLength <= 100)
      return { name, prefix }
  }
  return null
}
